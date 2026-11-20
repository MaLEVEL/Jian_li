import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 404, json: { detail: 'workspace not found' } });
      return;
    }
    const body = route.request().postDataJSON() as { state: unknown };
    await route.fulfill({ json: { state: body.state, updated_at: new Date().toISOString(), revision: 1 } });
  });
});

async function gotoDestination(page: Page, name: string) {
  await page.goto('/');
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
  const menu = page.getByRole('button', { name: '展开导航', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true }).click();
}

test('resume photo uploads, changes side, persists, previews and removes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoDestination(page, '简历版本');
  await page.getByRole('button', { name: '新建简历', exact: true }).click();
  await page.getByText('排版与主题', { exact: true }).click();

  await page.setInputFiles('.resume-photo-control input[type="file"]', '../docs/assets/sky-preview-390.png');
  await expect(page.getByAltText('当前简历照片预览')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('照片已处理为 3:4 JPEG，仅保存在当前简历版本。', { exact: true })).toBeVisible();

  await page.locator('#resume-photo-position').selectOption('left');
  await page.getByRole('tab', { name: '预览', exact: true }).click();
  const resumePhoto = page.locator('.resume-paper .resume-photo');
  await expect(resumePhoto).toBeVisible();
  await expect(resumePhoto).toHaveAttribute('data-photo-position', 'left');

  await page.reload();
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '简历版本', exact: true }).click();
  await page.getByRole('tab', { name: '预览', exact: true }).click();
  await expect(page.locator('.resume-paper .resume-photo')).toHaveAttribute('data-photo-position', 'left');

  await page.getByRole('tab', { name: '编辑', exact: true }).click();
  await page.getByText('排版与主题', { exact: true }).click();
  await page.getByRole('button', { name: '移除', exact: true }).click();
  await expect(page.getByAltText('当前简历照片预览')).toHaveCount(0);
});

test('opportunity import deduplicates and company blacklist hides and restores records', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoDestination(page, '机会中心');
  await page.getByText('手动粘贴或 CSV 预览', { exact: true }).click();
  await page.getByRole('tab', { name: 'CSV', exact: true }).click();
  await page.locator('.opportunity-import__field textarea').fill([
    'company,title,description,location,url',
    '云帆科技,AI 应用工程师,负责 Agent 应用、RAG 与评测。,上海,https://jobs.example.com/roles/ai-1',
    '云帆科技,AI 应用工程师,负责 Agent 应用、RAG、评测与可观测性。,上海,https://jobs.example.com/roles/ai-1?utm_source=feed',
  ].join('\n'));
  await page.getByRole('button', { name: '生成预览', exact: true }).click();
  await page.getByRole('button', { name: /确认导入/ }).click();

  await expect(page.locator('.opportunity-card')).toHaveCount(1);
  await expect(page.getByText(/重复记录已按来源合并/)).toBeVisible();
  const operationBar = page.getByRole('region', { name: '机会操作条' });
  await expect(operationBar.getByRole('button', { name: '用 JD 匹配', exact: true })).toBeVisible();
  await expect(operationBar.getByRole('button', { name: '选择简历', exact: true })).toBeVisible();
  await expect(operationBar.getByRole('button', { name: '带入定制', exact: true })).toBeVisible();
  await expect(page.locator('.opportunity-card').getByText('安排跟进', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '拉黑公司', exact: true }).click();
  await expect(page.locator('.opportunity-card')).toHaveCount(0);
  await page.getByRole('button', { name: /显示黑名单/ }).click();
  await expect(page.locator('.opportunity-card')).toHaveCount(1);
  await expect(page.getByText('公司级黑名单', { exact: true })).toBeVisible();
  await expect(page.getByText(/用户从机会操作条拉黑/)).toBeVisible();

  await page.getByRole('button', { name: '恢复机会', exact: true }).click();
  await expect(page.locator('.opportunity-card__blacklist')).toHaveCount(0);
  await expect(page.locator('.opportunity-card')).toHaveCount(1);
});

test('opportunity JD matching switches to the resume linked to that opportunity', async ({ page }) => {
  await page.unroute('**/api/workspace');
  const resumes = [
    { id: 'resume-current', title: '当前误选版', source: 'generated', template: 'graduate', identity: { name: '张同学', email: 'test@example.com', phone: '', location: '上海' }, targetRole: 'Python 工程师', sections: { summary: '用于匹配的简历内容', skills: ['Python'], education: [], projects: ['项目'], experience: [], awards: [] }, plainText: '当前误选版 Python 项目经历', unsupportedClaims: [], reviewed: true, createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-20T00:00:00.000Z' },
    { id: 'resume-linked', title: '机会关联版', source: 'generated', template: 'graduate', identity: { name: '张同学', email: 'test@example.com', phone: '', location: '上海' }, targetRole: 'Python 工程师', sections: { summary: '用于匹配的简历内容', skills: ['Python'], education: [], projects: ['项目'], experience: [], awards: [] }, plainText: '机会关联版 Python 项目经历', unsupportedClaims: [], reviewed: true, createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-20T00:00:00.000Z' },
  ];
  const state = {
    profile: { name: '张同学', email: 'test@example.com', phone: '', location: '上海', targetRole: 'Python 工程师', headline: '', education: '', skills: 'Python', projects: '项目', experience: '', awards: '' },
    resumes,
    applications: [],
    opportunities: [{
      id: 'opportunity-linked', stage: 'saved', job: { company: '云帆科技', title: 'Agent 工程师', description: '负责 RAG 与 Python 服务' }, source: 'manual', sourceKey: 'source-url:linked-role', channel: '', contact: '', notes: '', resumeId: 'resume-linked', createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-20T00:00:00.000Z', stageChangedAt: '2026-11-20T00:00:00.000Z', nextAction: { id: 'action-review', kind: 'review', title: '判断岗位是否值得投递', dueAt: '2026-11-21T09:00:00.000Z', createdAt: '2026-11-20T00:00:00.000Z' },
    }],
    jobPool: { savedViews: [] },
    version: 1,
    exportedAt: '2026-11-20T00:00:00.000Z',
  };
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { state, updated_at: '2026-11-20T00:00:00.000Z', revision: 1 } });
      return;
    }
    const body = route.request().postDataJSON() as { state: unknown };
    await route.fulfill({ json: { state: body.state, updated_at: new Date().toISOString(), revision: 2 } });
  });

  await gotoDestination(page, '机会中心');
  await page.getByRole('region', { name: '机会操作条' }).getByRole('button', { name: '用 JD 匹配', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '选择简历版本', exact: true })).toHaveValue('resume-linked');
  await expect(page.getByText('机会关联版', { exact: true }).first()).toBeVisible();
});

test('blacklisted company interviews are excluded from today dashboard', async ({ page }) => {
  await page.unroute('**/api/workspace');
  const state = {
    profile: { name: '张同学', email: 'test@example.com', phone: '', location: '上海', targetRole: 'Python 工程师', headline: '', education: '', skills: '', projects: '', experience: '', awards: '' },
    resumes: [{
      id: 'resume-hidden', title: '黑名单测试简历', source: 'generated', template: 'graduate', identity: { name: '张同学', email: 'test@example.com', phone: '', location: '上海' }, targetRole: 'Agent 工程师', sections: { summary: '测试', skills: ['Python'], education: [], projects: [], experience: [], awards: [] }, plainText: '黑名单测试简历 Python', unsupportedClaims: [], reviewed: true, createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-20T00:00:00.000Z',
    }],
    applications: [{
      id: 'application-hidden', job: { company: '黑名单公司', title: 'Agent 工程师', description: 'JD' }, status: 'interviewing', appliedAt: '2026-11-20', channel: 'BOSS', hrContact: '', followUpAt: '', interviewAt: new Date().toISOString(), notes: '', resumeId: 'resume-hidden', resumeTitle: '黑名单测试简历', report: { score: 0, weightedCoverage: 0, skillCoverage: 0, projectCoverage: 0, matchedKeywords: [], missingKeywords: [], scoreBreakdown: [], strengths: [], gaps: [], suggestions: [], optimizedBullets: [] }, questions: { technical: [], project: [], behavioral: [] }, createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-20T00:00:00.000Z',
    }],
    opportunities: [{ id: 'opportunity-hidden', stage: 'interviewing', job: { company: '黑名单公司', title: 'Agent 工程师', description: 'JD' }, source: 'manual', sourceKey: 'source-job:hidden', applicationId: 'application-hidden', channel: 'BOSS', contact: '', notes: '', blacklistedAt: '2026-11-20T00:00:00.000Z', blacklistReason: '不匹配', createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-20T00:00:00.000Z', stageChangedAt: '2026-11-20T00:00:00.000Z' }],
    jobPool: { savedViews: [] },
    version: 1,
    exportedAt: '2026-11-20T00:00:00.000Z',
  };
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { state, updated_at: '2026-11-20T00:00:00.000Z', revision: 1 } });
      return;
    }
    const body = route.request().postDataJSON() as { state: unknown };
    await route.fulfill({ json: { state: body.state, updated_at: new Date().toISOString(), revision: 2 } });
  });

  await page.goto('/');
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText('黑名单公司', { exact: true })).toHaveCount(0);
});
