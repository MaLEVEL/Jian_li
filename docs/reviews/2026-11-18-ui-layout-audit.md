# UI 布局独立审计（2026-11-18）

## 结论

**当前代码的独立静态审查未发现未关闭 P1/P2。** 两个 P3 均已按代码证据关闭：页面内切换统一收敛到 `navigateTo()`，顶部 header 宽距从 `100vw` 改为 `100%`。本审计只做代码与文档静态复核；浏览器 suite、视觉截图和 Docker 证据由父代理执行，二者不混同为独立复现。

审查对象为当前未提交工作区；功能基线来自 main `e63fe9b13410eb9d53b68e4006aee728f27f61b5`。本轮审查者唯一仓库写入为本报告，未修改实现、测试或配置，未运行浏览器/Docker，未读取 `.env`，未提交或推送。

## 上一轮 UI 验收遗漏

- `docs/verification.md` 记录了 1440/390/320/横屏无横向滚动、模板切换、键盘焦点、触控目标和浏览器无运行错误，但没有记录标题输入、保存按钮与模板选择器的几何交集检查，也没有覆盖页面内 CTA 导致移动菜单保持展开的状态流。
- 当时桌面基准仍是左侧 `aside.sidebar`：`App.tsx` 在桌面为侧栏，仅在断点内变为横向导航。因此旧验收中的“导航在自身容器内横向滚动”不能证明本轮要求的桌面顶部导航。
- `docs/reviews/2026-11-18-superpowers-audit.md` 的重点 是六模板、HTML/PDF/DOCX 结构与事实保留，并明确“没有穷尽验证所有 UI 控件”。它没有覆盖 `details` 版本管理、编辑/预览 tabpanel 隐藏、移动菜单开关、数据设置移动端可访问名称或 header `100vw` 滚动条风险。
- 旧文档中的浏览器与 Docker 结果属于父代理执行并记录的验收证据；本审计未将其升级为独立观察。

## 当前实现复核

- 顶部结构：`frontend/src/App.tsx:903-944` 使用 `div.app-shell > header.site-header + main.main-stage`，主内容为唯一 `<main>`；移动导航按钮有 `aria-expanded`、`aria-controls`，导航内 Escape 会收起并回到按钮。
- 页面切换：`frontend/src/App.tsx:896-900` 的 `navigateTo(tab)` 统一执行 `setActiveTab`、收起移动菜单并聚焦主内容。静态检索显示 `setActiveTab(` 仅剩该包装函数内部一处；工作台与简历预览的 `onGo` 均传入 `navigateTo`，生成、示例、导入备份、清空数据、模板应用等内部切页也走同一包装。
- 数据设置：`frontend/src/App.tsx:951-975` 保留导出、导入、清空与说明；移动端隐藏文字时 `summary aria-label="数据设置"` 保持可访问名称。
- 版本与导入：`frontend/src/views.tsx:342-345` 管理 `activePane` 与 `managerOpen`；`frontend/src/views.tsx:382-443` 的受控 `<details>` 通过 `onToggle` 同步。新建切编辑、识别导入切编辑、选择版本切编辑、确认导入切预览的回调链完整。
- 编辑/预览 tab：`frontend/src/views.tsx:445-457` 实现 `tablist`、roving `tabIndex`、Arrow/Home/End；`frontend/src/views.tsx:461` 与 `:501` 是对应 tabpanel，`hidden` 由状态驱动，`frontend/src/workspace.css:50` 强制隐藏非活动 pane。
- 布局所有权：`frontend/src/workspace.css` 后加载并接管顶部导航、工具栏、版本管理、双 pane 与预览画布。旧侧栏/三列编辑器几何规则已从 `styles.css`/`portfolio.css` 移除；残留 `.resume-list`/`.import-panel` 主题规则被 `.version-manager ...` 更高特异性规则覆盖。

## P3 发现与关闭

### [P3，已关闭] 页面内切换不收起移动菜单

- 原风险：只有顶部导航按钮走 `navigateTo()`；工作台/编辑器 CTA、备份导入和清空数据直接 `setActiveTab` 时，移动菜单展开状态不会复位。
- 关闭证据：当前 `App.tsx` 中所有页面切换路径均改为 `navigateTo()`；静态检索仅剩 `navigateTo` 内部的 `setActiveTab(tab)`。该关闭为代码级结论，父代理 15 项 suite 的顶部导航用例证明导航目标、焦点和菜单收起，但不逐项覆盖所有页面内 CTA。
- 结论：**关闭**。后续若新增切页入口，应继续复用 `navigateTo` 或等价包装。

### [P3，已关闭] `100vw` header 宽距在经典滚动条浏览器可能造成横向溢出

- 原风险：`workspace.css` 使用 `calc((100vw - 1360px) / 2)`；`100vw` 包含竖向滚动条宽度而可用布局宽度不包含，宽屏经典滚动条环境可能产生文档级横向滚动。
- 关闭证据：`frontend/src/workspace.css:3` 已改为 `calc((100% - 1360px) / 2)`，百分比基于 header 包含块宽度，不把滚动条宽度计入。
- 结论：**代码级关闭**。父代理浏览器 suite 的 `scrollWidth <= innerWidth` 能覆盖其运行环境，但仍不等价于所有浏览器/滚动条策略穷尽。

## 验证证据与边界

- 独立无写入检查：当前工作区 `frontend` TypeScript `tsc -p tsconfig.json --noEmit` 通过；`git diff --check` 通过。
- 父代理扩展 suite 源码声明 15 项：6 个宽度的标题/模板控件分离与六模板触控范围，1 个顶部导航与编辑/预览切换，1 个键盘/编辑保留/版本选择，1 个导入确认与 DOCX 人工审阅门槛/真实下载，3 个窄宽度六模板预览，3 个宽度的全目的地导航与移动 Escape。最终结果以父代理实际复跑输出为准，本审计未运行浏览器，不以声明冒充通过。
- 静态审查支持当前结构与回调无 P1/P2，不证明所有浏览器渲染、打印分页、Word/WPS 视觉一致或真实用户可用性结论。
