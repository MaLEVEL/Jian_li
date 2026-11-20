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
async function navigateToBuilder(page: Page) {
  await page.goto('/');
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
  const navigation = page.getByRole('navigation', { name: '主导航' });
  const menu = page.getByRole('button', { name: '展开导航', exact: true });
  if (await menu.isVisible()) {
    await menu.click();
    const materials = navigation.getByRole('button', { name: '材料', exact: true });
    if (await materials.isVisible()) {
      await materials.click();
      await navigation.getByRole('button', { name: '简历版本 · 默认', exact: true }).click();
    } else {
      await navigation.getByRole('button', { name: '简历版本', exact: true }).click();
    }
  } else {
    await navigation.getByRole('button', { name: '简历版本', exact: true }).click();
  }
  await expect(page.locator('.builder-controls')).toBeVisible();
}

async function openBuilder(page: Page) {
  await navigateToBuilder(page);
  await page.getByRole('button', { name: /^(新建|新建简历)$/ }).click();
  await expect(page.locator('.title-editor input')).toBeVisible();
}

type LayoutBox = { x: number; y: number; width: number; height: number };

async function layoutBoxes(locator: Locator): Promise<LayoutBox[]> {
  return locator.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
}

function distinctAxisCount(values: number[], tolerance = 2) {
  const positions: number[] = [];
  for (const value of [...values].sort((left, right) => left - right)) {
    if (!positions.some((position) => Math.abs(position - value) <= tolerance)) positions.push(value);
  }
  return positions.length;
}

async function openAppearance(page: Page) {
  await page.getByText('排版与主题', { exact: true }).click();
  await expect(page.locator('.resume-appearance')).toHaveJSProperty('open', true);
  await expect(page.locator('.resume-appearance__grid')).toBeVisible();
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

for (const width of [1920, 1440, 1280, 1024, 768, 390, 320]) {
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

test('empty builder presents creation and import paths without inactive layout controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigateToBuilder(page);

  await expect.soft(page.locator('.builder-empty')).toHaveCount(1);
  await expect.soft(page.getByRole('button', { name: '新建简历', exact: true })).toBeVisible();
  await page.locator('.version-manager > summary').click();
  await expect.soft(page.locator('.version-manager')).toHaveJSProperty('open', false);
  await page.getByRole('button', { name: '上传 / 粘贴简历', exact: true }).click();
  await expect.soft(page.locator('.version-manager')).toHaveJSProperty('open', true);
  await expect.soft(page.getByLabel('导入后的版本名称', { exact: true })).toBeFocused();
  const [importField, stickyHeader] = await Promise.all([
    page.getByLabel('导入后的版本名称', { exact: true }).boundingBox(),
    page.locator('.site-header').boundingBox(),
  ]);
  expect.soft(importField && stickyHeader, 'import field and sticky header').not.toBeNull();
  if (importField && stickyHeader) {
    expect.soft(importField.y, 'import field hidden under sticky header').toBeGreaterThanOrEqual(stickyHeader.y + stickyHeader.height - 1);
    expect.soft(importField.y + importField.height, 'import field scrolled out of view').toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  await expect.soft(page.getByText('还没有简历')).toHaveCount(0);
  await expect.soft(page.getByText('从一份简历开始')).toHaveCount(0);
  await expect.soft(page.locator('.version-picker')).toHaveCount(0);
  await expect.soft(page.locator('.template-picker select')).toHaveCount(0);
  await expect.soft(page.locator('.resume-appearance')).toHaveCount(0);
  await expect.soft(page.locator('.builder-tabs:visible')).toHaveCount(0);
  await expect.soft(page.locator('.builder-pane:visible')).toHaveCount(0);
});

test('desktop toolbar keeps three logical controls on row one and the create CTA fixed when appearance expands', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openBuilder(page);

  const builder = page.locator('.builder-controls');
  expect.soft(await builder.evaluate((element) => element.tagName)).toBe('SECTION');

  const childBoxes = await builder.locator(':scope > *').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  const firstRowY = Math.min(...childBoxes.map((box) => box.y));
  expect.soft(childBoxes.filter((box) => Math.abs(box.y - firstRowY) <= 1)).toHaveLength(3);

  const create = page.getByRole('button', { name: '新建简历', exact: true });
  const before = await create.boundingBox();
  expect.soft(before).not.toBeNull();
  if (!before) return;

  const appearanceBefore = await page.locator('.resume-appearance').boundingBox();
  expect.soft(appearanceBefore).not.toBeNull();
  if (appearanceBefore) {
    expect.soft(appearanceBefore.y).toBeGreaterThanOrEqual(before.y + before.height);
  }

  await openAppearance(page);
  const after = await create.boundingBox();
  expect.soft(after).not.toBeNull();
  if (after) {
    expect.soft(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  }
});

test('tablet toolbar limits navigation and appearance controls at 1024px', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1000 });
  await openBuilder(page);

  const header = await page.locator('.site-header').boundingBox();
  expect.soft(header).not.toBeNull();
  if (header) expect.soft(header.height).toBeLessThanOrEqual(120);

  await openAppearance(page);
  const fields = await layoutBoxes(page.locator('.resume-appearance__grid > label:visible'));
  expect.soft(fields).toHaveLength(6);
  expect.soft(distinctAxisCount(fields.map((field) => field.x))).toBe(4);
  fields.forEach((field, index) => {
    expect.soft(field.width, `appearance field ${index + 1} is narrower than 180px`).toBeGreaterThanOrEqual(179.5);
  });
});

test('layout breakpoint boundaries keep the primary toolbar stable', async ({ page }) => {
  await page.setViewportSize({ width: 1181, height: 1000 });
  await openBuilder(page);
  const expectations: Array<{ width: number; firstRow: number; mobileNav: boolean; primaryColumns: number }> = [
    { width: 1181, firstRow: 3, mobileNav: false, primaryColumns: 2 },
    { width: 1180, firstRow: 2, mobileNav: false, primaryColumns: 2 },
    { width: 881, firstRow: 2, mobileNav: false, primaryColumns: 2 },
    { width: 880, firstRow: 2, mobileNav: true, primaryColumns: 2 },
    { width: 761, firstRow: 2, mobileNav: true, primaryColumns: 2 },
    { width: 760, firstRow: 1, mobileNav: true, primaryColumns: 1 },
    { width: 370, firstRow: 1, mobileNav: true, primaryColumns: 1 },
  ];
  for (const expected of expectations) {
    await page.setViewportSize({ width: expected.width, height: 1000 });
    const header = await page.locator('.site-header').boundingBox();
    expect.soft(header, `header at ${expected.width}px`).not.toBeNull();
    if (header && expected.mobileNav) expect.soft(header.height, `header at ${expected.width}px`).toBeLessThanOrEqual(120);
    await expect.soft(page.getByRole('button', { name: '展开导航', exact: true })).toBeVisible({ visible: expected.mobileNav });
    const [version, template, create] = await Promise.all([
      page.locator('.version-picker').boundingBox(),
      page.locator('.template-picker').boundingBox(),
      page.getByRole('button', { name: '新建简历', exact: true }).boundingBox(),
    ]);
    expect.soft(version && template && create, `primary controls at ${expected.width}px`).not.toBeNull();
    if (version && template && create) {
      expect.soft(distinctAxisCount([version.x, template.x]), `primary columns at ${expected.width}px`).toBe(expected.primaryColumns);
      if (expected.firstRow === 3) {
        expect.soft(Math.abs(create.y - version.y), `desktop CTA row at ${expected.width}px`).toBeLessThanOrEqual(1);
      } else {
        expect.soft(create.y, `stacked CTA row at ${expected.width}px`).toBeGreaterThanOrEqual(template.y + template.height - 1);
      }
    }
    expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `horizontal overflow at ${expected.width}px`).toBe(true);
  }
});

test('collapsed tablet toolbar uses two primary columns and three appearance columns at 768px', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  await openBuilder(page);

  const header = await page.locator('.site-header').boundingBox();
  expect.soft(header).not.toBeNull();
  if (header) expect.soft(header.height).toBeLessThanOrEqual(120);

  const [version, template] = await Promise.all([
    page.locator('.version-picker').boundingBox(),
    page.locator('.template-picker').boundingBox(),
  ]);
  expect.soft(version).not.toBeNull();
  expect.soft(template).not.toBeNull();
  if (version && template) {
    expect.soft(Math.abs(version.y - template.y)).toBeLessThanOrEqual(1);
    expect.soft(template.x).toBeGreaterThan(version.x);
  }

  await openAppearance(page);
  const fields = await layoutBoxes(page.locator('.resume-appearance__grid > label:visible'));
  expect.soft(fields).toHaveLength(6);
  expect.soft(distinctAxisCount(fields.map((field) => field.x))).toBe(3);
  fields.forEach((field, index) => {
    expect.soft(field.width, `appearance field ${index + 1} is narrower than 180px`).toBeGreaterThanOrEqual(179.5);
  });
});

test('preview actions switch from two columns to one column at the 370px boundary', async ({ page }) => {
  await page.setViewportSize({ width: 371, height: 900 });
  await openBuilder(page);
  await page.getByRole('tab', { name: '预览', exact: true }).click();

  for (const expected of [{ width: 371, columns: 2 }, { width: 370, columns: 1 }]) {
    await page.setViewportSize({ width: expected.width, height: 900 });
    const actions = await layoutBoxes(page.locator('.preview-actions button:visible'));
    expect.soft(actions).toHaveLength(4);
    expect.soft(distinctAxisCount(actions.map((action) => action.x)), `preview action columns at ${expected.width}px`).toBe(expected.columns);
    expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `horizontal overflow at ${expected.width}px`).toBe(true);
  }
});

test('mobile toolbar stacks primary controls and keeps appearance controls touchable at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openBuilder(page);

  const [version, template] = await Promise.all([
    page.locator('.version-picker').boundingBox(),
    page.locator('.template-picker').boundingBox(),
  ]);
  expect.soft(version).not.toBeNull();
  expect.soft(template).not.toBeNull();
  if (version && template) {
    expect.soft(distinctAxisCount([version.x, template.x])).toBe(1);
    expect.soft(template.y).toBeGreaterThan(version.y + version.height);
  }

  await openAppearance(page);
  const fields = await layoutBoxes(page.locator('.resume-appearance__grid > label:visible'));
  expect.soft(fields).toHaveLength(6);
  expect.soft(distinctAxisCount(fields.map((field) => field.x))).toBe(2);
  fields.forEach((field, index) => {
    expect.soft(field.width, `appearance field ${index + 1} is narrower than 140px`).toBeGreaterThanOrEqual(139.5);
  });

  const controls = await layoutBoxes(page.locator('.builder-controls button:visible, .builder-controls select:visible, .builder-controls input:visible:not([type="file"]), .builder-controls summary:visible'));
  expect.soft(controls.length).toBeGreaterThan(0);
  controls.forEach((control, index) => {
    expect.soft(control.height, `visible toolbar target ${index + 1} is shorter than 44px`).toBeGreaterThanOrEqual(43.5);
  });
  expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('narrow preview actions form one column without horizontal overflow at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openBuilder(page);
  await page.getByRole('tab', { name: '预览', exact: true }).click();

  const actions = await layoutBoxes(page.locator('.preview-actions button:visible'));
  expect.soft(actions).toHaveLength(4);
  if (actions.length) {
    const first = actions[0];
    actions.forEach((action, index) => {
      expect.soft(Math.abs(action.x - first.x), `preview action ${index + 1} is not aligned with the first action`).toBeLessThanOrEqual(1);
      expect.soft(Math.abs(action.width - first.width), `preview action ${index + 1} is not full-width like the first action`).toBeLessThanOrEqual(1);
      if (index > 0) {
        const previous = actions[index - 1];
        expect.soft(action.y, `preview action ${index + 1} overlaps the previous action`).toBeGreaterThanOrEqual(previous.y + previous.height - 0.5);
      }
    });
  }
  expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('appearance numeric inputs clamp out-of-range values to supported limits', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openBuilder(page);
  await openAppearance(page);

  const fontSize = page.getByRole('spinbutton', { name: /^字号/ });
  const lineHeight = page.getByRole('spinbutton', { name: /^行距/ });
  const pageMargin = page.getByRole('spinbutton', { name: /^页边距/ });

  await fontSize.fill('');
  await fontSize.pressSequentially('1');
  await expect.soft(fontSize).toHaveValue('1');
  await fontSize.pressSequentially('3');
  await expect.soft(fontSize).toHaveValue('13');
  await fontSize.fill('99');
  await fontSize.press('Enter');
  await expect.soft(fontSize).toHaveValue('16');
  await fontSize.fill('');
  await fontSize.press('Tab');
  await expect.soft(fontSize).toHaveValue('16');

  await lineHeight.fill('0.5');
  await lineHeight.press('Tab');
  await expect.soft(lineHeight).toHaveValue('1.25');

  await pageMargin.fill('40');
  await pageMargin.press('Tab');
  await expect.soft(pageMargin).toHaveValue('24');
});

test('upload notice updates a polite live status region', async ({ page }) => {
  await openBuilder(page);
  await page.locator('.version-manager > summary').click();
  const status = page.locator('.resume-upload-row [role="status"]:visible');
  expect.soft(await status.count()).toBe(1);
  if (await status.count()) {
    await expect.soft(status).toHaveAttribute('aria-live', 'polite');

    let parseRequestCount = 0;
    await page.route('**/api/parse/resume', async (route) => {
      parseRequestCount += 1;
      expect(route.request().postDataBuffer()?.length).toBeGreaterThan(0);
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      await route.fulfill({ json: { text: '王上传\nwang@example.com\n项目经历\n使用 FastAPI 完成简历解析服务。', filename: 'uploaded-resume.txt' } });
    });
    const fileChooser = page.waitForEvent('filechooser');
    await page.getByText('上传 PDF / TXT / DOCX', { exact: true }).click();
    const chooser = await fileChooser;
    await chooser.setFiles({
      name: 'uploaded-resume.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('uploaded resume', 'utf8'),
    });
    await expect.soft(status).toHaveAttribute('aria-busy', 'true');
    await expect.soft(status).toContainText('正在解析 uploaded-resume.docx');
    await expect.soft(page.locator('.resume-upload-row input[type="file"]')).toHaveAttribute('aria-disabled', 'true');
    const blockedFileChooser = page.waitForEvent('filechooser', { timeout: 450 }).catch(() => null);
    await page.locator('.resume-upload-row label').click();
    expect.soft(await blockedFileChooser, 'busy upload opened a second file chooser').toBeNull();
    await expect.soft(status).toContainText('已解析 uploaded-resume.docx');
    expect.soft(parseRequestCount, 'duplicate upload request count').toBe(1);
    await expect.soft(status).toHaveAttribute('aria-busy', 'false');
  }
});

test('review checkbox exposes at least a 44px labelled hit target', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openBuilder(page);

  const checkbox = page.getByRole('checkbox', { name: '我已核对', exact: true });
  const hitArea = await checkbox.evaluate((element) => {
    const label = element.closest('label');
    if (!label) return null;
    const rect = label.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect.soft(hitArea).not.toBeNull();
  if (hitArea) {
    expect.soft(hitArea.width).toBeGreaterThanOrEqual(44);
    expect.soft(hitArea.height).toBeGreaterThanOrEqual(44);
  }
});

test('main content focus is visibly outlined after keyboard skip navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });

  const main = page.locator('#main-content');
  const skip = page.getByRole('link', { name: '跳到主要内容', exact: true });
  await page.keyboard.press('Tab');
  await expect.soft(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.soft(main).toBeFocused();

  const focusStyle = await main.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor };
  });
  expect.soft(focusStyle.outlineStyle, `main focus style: ${JSON.stringify(focusStyle)}`).toBe('solid');
  expect.soft(Number.parseFloat(focusStyle.outlineWidth), `main focus style: ${JSON.stringify(focusStyle)}`).toBeGreaterThanOrEqual(3);
  expect.soft(focusStyle.outlineColor, `main focus style: ${JSON.stringify(focusStyle)}`).toBe('rgb(7, 84, 126)');
});
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
    const workspace = localStorage.getItem('jobfit-ai-web-mvp');
    const sync = localStorage.getItem('jobfit-workspace-sync-v1');
    const profileName = workspace ? JSON.parse(workspace).profile?.name : '';
    const dirty = sync ? JSON.parse(sync).dirty : false;
    return profileName === '本地即时修改' && dirty === true;
  })).toBe(true);

  await page.reload();
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('.header-person strong')).toHaveText('本地即时修改', { timeout: 10_000 });
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
    await expect(page.locator('#resume-accent-color')).not.toHaveValue('');
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

test('uploaded resumes enter the review and edit workflow', async ({ page }) => {
  await page.route('**/api/parse/resume', async (route) => {
    const body = route.request().postDataBuffer();
    expect(body?.length).toBeGreaterThan(0);
    await route.fulfill({ json: { text: '王上传\\nwang@example.com\\n求职意向：Python Agent 工程师\\n项目经历\\n使用 FastAPI 和 RAG 完成简历解析服务。', filename: 'uploaded-resume.txt' } });
  });
  await openBuilder(page);
  await page.locator('.version-manager > summary').click();
  await page.setInputFiles('.resume-upload-row input[type="file"]', {
    name: 'uploaded-resume.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('uploaded resume', 'utf8'),
  });
  await expect(page.getByText('已解析 uploaded-resume.docx，请核对后保存为简历版本。')).toBeVisible();
  await expect(page.locator('textarea[placeholder="粘贴简历文本"]')).toHaveValue(/王上传/);
  await page.getByRole('button', { name: '识别并核对内容', exact: true }).click();
  await page.getByRole('button', { name: /保存为简历版本|确认保存|确认导入/ }).click();
  await expect(page.getByRole('tab', { name: '预览', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: '编辑', exact: true }).click();
  await page.getByLabel('姓名', { exact: true }).fill('王上传');
  await page.getByRole('tab', { name: '预览', exact: true }).click();
  await expect(page.locator('.resume-paper')).toContainText('王上传');
});

test('appearance controls update preview, persist, and keep resume content', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openBuilder(page);
  await page.locator('.title-editor input').fill('排版保留测试版本');
  await page.locator('.title-editor input').press('Enter');
  await page.getByLabel('姓名', { exact: true }).fill('排版保留测试');
  await page.locator('.template-picker select').selectOption('academic');
  await page.getByText('排版与主题', { exact: true }).click();
  await page.getByRole('combobox', { name: '页面容量', exact: true }).selectOption('2');
  await page.getByRole('combobox', { name: '字体', exact: true }).selectOption('serif');
  await page.getByRole('spinbutton', { name: /^字号/ }).fill('13');
  await page.getByRole('spinbutton', { name: /^行距/ }).fill('1.7');
  await page.getByRole('spinbutton', { name: /^页边距/ }).fill('18');
  await page.getByRole('combobox', { name: '主题色', exact: true }).selectOption('#245f82');
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
test('opportunity center exposes BOSS inbox and local API settings', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '机会中心', exact: true }).click();
  await expect(page.getByRole('heading', { name: '先判断什么值得投入，再推进下一步。', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '机会漏斗', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: /BOSS 职位收件箱/ }).click();
  await expect(page.getByRole('heading', { name: '收到的 BOSS 岗位', exact: true })).toBeVisible();

  await expect(page.getByText('数据设置', { exact: true })).toHaveCount(0);
  await expect(page.getByText('清空简历与投递', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'AI 服务配置', exact: true }).click();
  await expect(page.getByLabel('请求地址', { exact: true })).toBeVisible();
  await expect(page.getByLabel('请求地址', { exact: true })).toHaveValue('https://open.bigmodel.cn/api/paas/v4');
  await expect(page.getByPlaceholder('仅保存在当前浏览器')).toHaveAttribute('type', 'password');
  await page.getByLabel('请求地址', { exact: true }).fill('https://api.example.com/v1');
  await page.getByPlaceholder('仅保存在当前浏览器').fill('local-only-key');
  await page.getByRole('button', { name: '保存到当前浏览器', exact: true }).click();
  await page.reload();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '机会中心', exact: true }).click();
  await page.getByRole('button', { name: 'AI 服务配置', exact: true }).click();
  await expect(page.getByLabel('请求地址', { exact: true })).toHaveValue('https://api.example.com/v1');
  expect(await page.getByPlaceholder('仅保存在当前浏览器').inputValue()).toBe('local-only-key');
});

test('a manual opportunity progresses through the V1 task flow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
  await openBuilder(page);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '机会中心', exact: true }).click();
  await page.getByText('手动粘贴或 CSV 预览').click();
  await page.getByRole('tab', { name: '粘贴', exact: true }).click();
  await page.getByPlaceholder('云帆科技 | AI 产品实习生 | 上海 | 负责 Agent 产品与 RAG 验证').fill('云帆科技|AI Agent 工程师|上海|负责 Python Agent、RAG 和 FastAPI 服务开发。');
  await page.getByRole('button', { name: /生成预览/ }).click();
  await expect(page.getByRole('table', { name: /导入预览/ })).toContainText('AI Agent 工程师');
  await page.getByRole('button', { name: /确认导入/ }).click();
  await expect(page.getByRole('heading', { name: 'AI Agent 工程师', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '导出当前机会', exact: true })).toBeEnabled();

  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '今日', exact: true }).click();
  await expect(page.getByText('判断岗位是否值得投递').first()).toBeVisible();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '机会中心', exact: true }).click();
  await page.getByRole('button', { name: '用 JD 匹配', exact: true }).click();
  await expect(page.getByLabel('公司名', { exact: true })).toHaveValue('云帆科技');
  await expect(page.getByRole('textbox', { name: /岗位 JD/ })).toHaveValue(/RAG/);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '机会中心', exact: true }).click();
  await page.getByRole('button', { name: /推进至 已收藏/ }).click();
  await expect(page.getByRole('button', { name: /推进至 定制中/ })).toBeVisible();
  await page.getByRole('button', { name: '不适合', exact: true }).click();
  await page.getByRole('button', { name: '撤销状态', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AI Agent 工程师', exact: true })).toBeVisible();
});

test('a BOSS job enters the funnel without automatic application or contact', async ({ page }) => {
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
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
  await openBuilder(page);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '机会中心', exact: true }).click();
  await page.getByRole('tab', { name: /BOSS 职位收件箱/ }).click();
  await page.getByRole('button', { name: '加入机会漏斗', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Python Agent 工程师', exact: true })).toBeVisible();
  await expect(page.getByText('没有触发投递或沟通', { exact: true }).or(page.getByText(/没有触发投递或沟通/))).toBeVisible();
  await page.getByRole('tab', { name: /BOSS 职位收件箱/ }).click();
  await page.getByRole('button', { name: '用这份 JD 匹配', exact: true }).click();
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

test('all desktop destinations stay reachable with grouped navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
  const destinations = ['今日', '机会中心', '跟进', '经历库', '简历版本', '模板与提纲', 'JD 匹配', '岗位分析与准备'];
  for (const name of destinations) {
    const target = page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true });
    await target.click();
    await expect(target).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#main-content')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
  }
  expect(errors).toEqual([]);
});

for (const width of [390, 320]) {
  test(`mobile task navigation remains reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect(page.locator('.workspace-loading')).toBeHidden({ timeout: 10_000 });
    const navigation = page.getByRole('navigation', { name: '主导航' });
    const toggle = page.getByRole('button', { name: '展开导航', exact: true });
    await toggle.click();
    for (const name of ['今日', '机会', '跟进', '材料', '更多任务']) {
      await expect(navigation.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await navigation.getByRole('button', { name: '材料', exact: true }).click();
    await navigation.getByRole('button', { name: '简历版本 · 默认', exact: true }).click();
    await page.getByRole('button', { name: /^(新建|新建简历)$/ }).click();
    await expect(page.locator('.title-editor')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByRole('button', { name: 'AI 服务配置', exact: true }).click();
    await expect(page.getByLabel('请求地址', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
