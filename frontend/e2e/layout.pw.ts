import { expect, test, type Locator, type Page } from '@playwright/test';

const ALL_TEMPLATE_IDS = ['graduate', 'graduate-research', 'internship', 'internship-project', 'experienced', 'experienced-specialist', 'technical', 'technical-timeline', 'sidebar', 'operations-impact', 'editorial', 'design-portfolio', 'management', 'consulting', 'academic', 'academic-compact'];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 404, json: { detail: 'workspace not found' } });
      return;
    }
    const body = route.request().postDataJSON() as { state: unknown };
    await route.fulfill({
      json: { state: body.state, updated_at: new Date().toISOString(), revision: 1 },
    });
  });
});
async function openBuilder(page: Page) {
  await page.goto('/');
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
  const menu = page.getByRole('button', { name: '展开导航', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '简历版本', exact: true }).click();
  await page.getByRole('button', { name: /^(新建|新建简历)$/ }).click();
  await expect(page.locator('.title-editor input')).toBeVisible();
}

async function separated(a: Locator, b: Locator) {
  const [one, two] = await Promise.all([a.boundingBox(), b.boundingBox()]);
  expect(one).not.toBeNull();
  expect(two).not.toBeNull();
  if (!one || !two) return;
  const overlapX = Math.min(one.x + one.width, two.x + two.width) - Math.max(one.x, two.x);
  const overlapY = Math.min(one.y + one.height, two.y + two.height) - Math.max(one.y, two.y);
  expect(overlapX <= 0 || overlapY <= 0, `overlapping controls: ${JSON.stringify({ one, two })}`).toBe(true);
}

for (const width of [1440, 1280, 1024, 768, 390, 320]) {
  test(`title and template controls stay separate at ${width}px`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 1000 });
    await openBuilder(page);
    await page.locator('.title-editor input').fill('Python Agent 全栈工程师 — 一个用于验证长版本名称的真实布局回归测试'.repeat(3));
    await separated(page.locator('.title-editor input'), page.locator('.template-picker select'));
    await separated(page.locator('.title-editor button'), page.locator('.template-picker select'));
    const checkedTemplates = ['graduate', 'sidebar', 'academic'];
    for (const value of checkedTemplates) {
      await page.locator('.template-picker select').selectOption(value);
      const visibleControls = page.locator('.builder-controls select:visible, .builder-controls button:visible, .title-editor input:visible, .title-editor button:visible');
      for (const control of await visibleControls.all()) {
        const box = await control.boundingBox();
        expect(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width).toBeTruthy();
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('workspace hydration blocks editing until the server snapshot resolves', async ({ page }) => {
  await page.unroute('**/api/workspace');
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'GET') {
      await new Promise((resolve) => setTimeout(resolve, 450));
      await route.fulfill({ status: 404, json: { detail: 'workspace not found' } });
      return;
    }
    const body = route.request().postDataJSON() as { state: unknown };
    await route.fulfill({ json: { state: body.state, updated_at: new Date().toISOString(), revision: 1 } });
  });
  await page.goto('/');
  await expect(page.getByText('正在恢复你的求职工作区', { exact: true })).toBeVisible();
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
});
test('dirty local workspace is preserved when another device has a newer revision', async ({ page }) => {
  await page.unroute('**/api/workspace');
  const profile = {
    name: '设备 B 的离线修改',
    email: 'b@example.com',
    phone: '',
    location: '杭州',
    targetRole: 'Python Agent 工程师',
    headline: '',
    education: '',
    skills: '',
    projects: '',
    experience: '',
    awards: '',
  };
  const remoteProfile = { ...profile, name: '设备 A 的服务器版本' };
  await page.addInitScript(({ localProfile }) => {
    localStorage.setItem('jobfit-ai-web-mvp', JSON.stringify({
      version: 1,
      profile: localProfile,
      resumes: [],
      applications: [],
    }));
    localStorage.setItem('jobfit-workspace-sync-v1', JSON.stringify({ dirty: true, revision: 1 }));
  }, { localProfile: profile });
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          state: { version: 1, profile: remoteProfile, resumes: [], applications: [] },
          updated_at: '2026-11-19T00:00:00.000Z',
          revision: 2,
        },
      });
      return;
    }
    await route.fulfill({ status: 409, json: { detail: 'conflict', current: null } });
  });

  await page.goto('/');
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('.header-person strong')).toHaveText('设备 B 的离线修改');
  await page.getByText('数据设置', { exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('发现另一台设备的更新');
  await expect(page.getByRole('alert')).toContainText('当前浏览器中的修改没有丢失');
});

test('local edits become dirty before the debounce and survive an immediate reload', async ({ page }) => {
  await page.unroute('**/api/workspace');
  const remoteProfile = {
    name: '服务器初始版本',
    email: 'server@example.com',
    phone: '',
    location: '上海',
    targetRole: 'Python 工程师',
    headline: '',
    education: '',
    skills: '',
    projects: '',
    experience: '',
    awards: '',
  };
  const remoteState = { version: 1, profile: remoteProfile, resumes: [], applications: [] };
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { state: remoteState, updated_at: '2026-11-19T00:00:00.000Z', revision: 1 } });
      return;
    }
    const body = route.request().postDataJSON() as { state: typeof remoteState };
    await route.fulfill({ json: { state: body.state, updated_at: new Date().toISOString(), revision: 2 } });
  });

  await page.goto('/');
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '经历库', exact: true }).click();
  await page.getByLabel('姓名', { exact: true }).fill('本地即时修改');
  await expect.poll(() => page.evaluate(() => {
    const value = localStorage.getItem('jobfit-workspace-sync-v1');
    return value ? JSON.parse(value).dirty : false;
  })).toBe(true);

  await page.reload();
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('.header-person strong')).toHaveText('本地即时修改');
});

test('the top header stays pinned while scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBuilder(page);
  await page.getByRole('tab', { name: '预览', exact: true }).click();
  await expect(page.locator('.resume-paper')).toBeVisible();

  const header = page.locator('.site-header');
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 1_200);
  await page.waitForFunction((previous) => window.scrollY > previous, before);
  await expect(header).toBeVisible();

  const box = await header.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeLessThanOrEqual(0);
  expect(box!.x).toBeLessThanOrEqual(0);
  expect(box!.width).toBe(1440);

  const navigation = await page.getByRole('navigation', { name: '主导航' }).boundingBox();
  expect(navigation).not.toBeNull();
  expect(navigation!.y).toBeGreaterThanOrEqual(0);
  expect(navigation!.y + navigation!.height).toBeLessThanOrEqual(box!.y + box!.height + 1);
});

test('skip link remains above the pinned header and is clickable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });

  const skipLink = page.getByRole('link', { name: '跳到主要内容' });
  await skipLink.focus();
  await expect(skipLink).toBeVisible();

  const box = await skipLink.boundingBox();
  expect(box).not.toBeNull();
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute('class'), [
    box!.x + box!.width / 2,
    box!.y + box!.height / 2,
  ]);
  expect(hit).toContain('skip-link');
});

test('skip link target clears the expanded mobile navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/');
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
  await page.getByRole('button', { name: '展开导航', exact: true }).click();

  await page.getByRole('link', { name: '跳到主要内容' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  const header = await page.locator('.site-header').boundingBox();
  const main = await page.locator('#main-content').boundingBox();
  expect(header).not.toBeNull();
  expect(main).not.toBeNull();
  expect(main!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
});

test('top navigation and editor/preview tabs remain operable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openBuilder(page);
  const nav = await page.getByRole('navigation', { name: '主导航' }).boundingBox();
  const main = await page.locator('#main-content').boundingBox();
  expect(nav && main && nav.y + nav.height <= main.y).toBeTruthy();
  await page.getByRole('tab', { name: '预览', exact: true }).click();
  await expect(page.locator('.resume-paper')).toBeVisible();
  await expect(page.locator('.resume-editor')).toBeHidden();
  const picker = page.locator('.template-picker select');
  for (const value of ALL_TEMPLATE_IDS) {
    await picker.selectOption(value);
    await expect(page.locator('.resume-paper')).toHaveClass(new RegExp(`resume-paper--${value}`));
    await expect(page.locator('.resume-paper section[data-section-id]')).toHaveCount(7);
    await expect(page.getByLabel('主题色', { exact: true })).not.toHaveValue('');
  }
  await page.getByRole('tab', { name: '编辑', exact: true }).click();
  await expect(page.locator('.resume-editor')).toBeVisible();
  await expect(page.locator('.resume-paper')).toBeHidden();
});

test('tabs support keyboard and preserve edits and version selection', async ({ page }) => {
  await openBuilder(page);
  const title = page.getByLabel('版本名称', { exact: true });
  await title.fill('Python Agent 作品版');
  await title.press('Enter');
  await page.getByLabel('姓名', { exact: true }).fill('布局验收同学');
  const editorTab = page.getByRole('tab', { name: '编辑', exact: true });
  await editorTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: '预览', exact: true })).toBeFocused();
  await expect(page.locator('.resume-paper')).toContainText('布局验收同学');
  await page.keyboard.press('Home');
  await expect(editorTab).toBeFocused();
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('布局验收同学');
  await page.getByRole('button', { name: '新建简历', exact: true }).click();
  await page.getByLabel('当前版本', { exact: false }).selectOption({ label: 'Python Agent 作品版' });
  await expect(title).toHaveValue('Python Agent 作品版');
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('布局验收同学');
});

test('import review and reviewed DOCX export remain available', async ({ page }) => {
  await openBuilder(page);
  await page.locator('.version-manager > summary').click();
  await page.getByLabel('导入后的版本名称', { exact: true }).fill('导入验收版本');
  await page.getByLabel('已有简历文本', { exact: true }).fill('李测试\n13800000000\nli@example.com\n求职意向：Python开发工程师\n项目经历\n使用 Python 和 FastAPI 完成岗位匹配系统。');
  await page.getByRole('button', { name: '识别并核对内容', exact: true }).click();
  await expect(page.getByRole('region', { name: '确认导入识别结果' })).toBeVisible();
  await page.getByRole('button', { name: /保存为简历版本|确认保存|确认导入/ }).click();
  await expect(page.getByRole('tab', { name: '预览', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.resume-paper')).toContainText('李测试');
  await page.getByRole('button', { name: '下载 .docx', exact: true }).click();
  await expect(page.getByText('请先勾选“我已核对”，再下载 Word (.docx) 文件。')).toBeVisible();
  await page.getByRole('checkbox', { name: '我已核对', exact: true }).check();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载 .docx', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/.docx$/);
});

test('appearance controls update preview, persist, and keep resume content', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openBuilder(page);
  await page.locator('.title-editor input').fill('排版保留测试版本');
  await page.locator('.title-editor input').press('Enter');
  await page.getByLabel('姓名', { exact: true }).fill('排版保留测试');
  await page.locator('.template-picker select').selectOption('academic');
  await page.getByText('排版与主题', { exact: true }).click();
  await page.getByLabel('页面容量', { exact: true }).selectOption('2');
  await page.getByLabel('字体', { exact: true }).selectOption('serif');
  await page.getByLabel('字号', { exact: true }).fill('13');
  await page.getByLabel('行距', { exact: true }).fill('1.7');
  await page.getByLabel('页边距', { exact: true }).fill('18');
  await page.getByLabel('主题色', { exact: true }).selectOption('#245f82');
  await page.getByRole('tab', { name: '预览', exact: true }).click();
  const paper = page.locator('.resume-paper');
  await expect(paper).toContainText('排版保留测试');
  await expect(paper).toHaveAttribute('data-page-count', '2');
  expect(await paper.evaluate((element) => getComputedStyle(element).fontSize)).toBe('17.3333px');
  await page.reload();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '简历版本', exact: true }).click();
  await page.locator('.version-picker select').selectOption({ label: '排版保留测试版本' });
  await page.getByRole('tab', { name: '预览', exact: true }).click();
  await expect(paper).toHaveAttribute('data-page-count', '2');
  await expect(paper).toContainText('排版保留测试');
});
test('BOSS integration center exposes guide, jobs, and local API settings', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: 'BOSS 接入', exact: true }).click();
  await expect(page.getByRole('heading', { name: '你把时间留给选择，重复粘贴交给系统。' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /接入教程/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'API 配置', exact: true }).click();
  await expect(page.getByLabel('请求地址', { exact: true })).toHaveValue('https://open.bigmodel.cn/api/paas/v4');
  await expect(page.getByPlaceholder('仅保存在当前浏览器')).toHaveAttribute('type', 'password');
  await page.getByLabel('请求地址', { exact: true }).fill('https://api.example.com/v1');
  await page.getByPlaceholder('仅保存在当前浏览器').fill('local-only-key');
  await page.getByRole('button', { name: '保存到当前浏览器', exact: true }).click();
  await page.reload();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: 'BOSS 接入', exact: true }).click();
  await page.getByRole('tab', { name: 'API 配置', exact: true }).click();
  await expect(page.getByLabel('请求地址', { exact: true })).toHaveValue('https://api.example.com/v1');
  expect(await page.getByPlaceholder('仅保存在当前浏览器').inputValue()).toBe('local-only-key');
});
test('a BOSS job can be handed off to the JD matching workspace', async ({ page }) => {
  const job = {
    id: 'boss-job-1', source: 'boss', source_job_id: 'boss-1',
    source_url: 'https://www.zhipin.com/job_detail/boss-1.html', company: '星河科技',
    title: 'Python Agent 工程师', location: '上海', salary: '25-40K', experience: '3-5年',
    education: '本科', description: '负责 Python Agent、RAG 和 FastAPI 服务开发。',
    recruiter_name: '招聘同学', recruiter_title: '技术招聘', tags: ['Python', 'Agent'],
    fetched_at: '2026-11-18T10:00:00Z', created_at: '2026-11-18T10:00:00Z', updated_at: '2026-11-18T10:00:00Z',
  };
  await page.route('**/api/boss/health', (route) => route.fulfill({ json: { status: 'ok', source: 'boss', count: 1 } }));
  await page.route('**/api/boss/jobs**', (route) => route.fulfill({ json: [job], headers: { 'X-Total-Count': '1' } }));
  await page.goto('/');
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '简历版本', exact: true }).click();
  await page.getByRole('button', { name: /新建简历/ }).click();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: 'BOSS 接入', exact: true }).click();
  await page.getByRole('tab', { name: /职位池/ }).click();
  await expect(page.getByLabel(/本地匹配分 \d+/)).toBeVisible();
  await page.getByRole('button', { name: '用这份 JD 匹配', exact: true }).click();
  await expect(page.locator('#primary-navigation button[aria-current="page"]')).toHaveText('JD 匹配（本地规则）');
  await expect(page.getByLabel('公司名', { exact: true })).toHaveValue('星河科技');
  await expect(page.getByLabel('岗位名', { exact: true })).toHaveValue('Python Agent 工程师');
  await expect(page.getByRole('textbox', { name: /岗位 JD/ })).toHaveValue(/RAG/);
});
test('sidebar preview keeps identity and content together on a full sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openBuilder(page);
  await page.getByRole('tab', { name: '预览', exact: true }).click();
  await page.locator('.template-picker select').selectOption('sidebar');
  const header = await page.locator('.resume-paper > header').boundingBox();
  expect(header).not.toBeNull();
  expect(header!.height).toBeLessThan(160);
});

for (const width of [768, 390, 320]) {
  test(`all template previews fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openBuilder(page);
    await page.getByRole('tab', { name: '预览', exact: true }).click();
    for (const value of ALL_TEMPLATE_IDS) {
      await page.locator('.template-picker select').selectOption(value);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), value).toBe(true);
      const paper = page.locator('.resume-paper');
      expect(await paper.evaluate((element) => element.scrollWidth <= element.clientWidth), value).toBe(true);
      if (width <= 390) {
        expect(await paper.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
      }
      const buttons = await page.locator('.preview-actions button').all();
      for (let i = 0; i < buttons.length; i++) {
        for (let j = i + 1; j < buttons.length; j++) await separated(buttons[i], buttons[j]);
      }
    }
  });
}

for (const width of [1440, 390, 320]) {
  test(`all destinations stay reachable with top navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
    for (const name of ['工作台', 'BOSS 接入', '岗位分析与准备', '经历库', '简历版本', '模板与提纲', 'JD 匹配（本地规则）', '投递管理']) {
      const toggle = page.getByRole('button', { name: '展开导航', exact: true });
      if (await toggle.isVisible()) await toggle.click();
      const target = page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true });
      await target.click();
      await expect(page.locator('#primary-navigation button[aria-current="page"]')).toHaveText(name);
      await expect(page.locator('#main-content')).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
      if (width < 760) await expect(page.getByRole('button', { name: '展开导航', exact: true })).toHaveAttribute('aria-expanded', 'false');
    }
    if (width < 760) {
      const toggle = page.getByRole('button', { name: '展开导航', exact: true });
      await toggle.click();
      await page.getByRole('navigation', { name: '主导航' }).getByRole('button').first().focus();
      await page.keyboard.press('Escape');
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
    expect(errors).toEqual([]);
  });
}
