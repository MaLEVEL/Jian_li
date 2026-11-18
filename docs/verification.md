# 验证记录（2026-11-18，Asia/Shanghai）

范围：Windows 本地 Python 3.12、React/TypeScript、Linux Docker、真实智谱兼容接口。以下区分本地自动化、合成评估与真实模型验收；密钥、输入快照、数据库和临时验收产物均保留在忽略目录中。

## 自动化与评估

- `pytest backend/tests -q`：**89 passed**。包括权重/别名/否定句、模型 HTTP 异常、畸形 choice/message、Token 预算与截断、上传限制、素材/历史/批量/CSV、检索、三项业务技能与真实性边界。
- `ruff check backend/app backend/tests backend/eval`：通过；`pip check`：无依赖冲突。没有声称旧的 `archive/backend-legacy` 同样通过新规则。
- `npm --prefix frontend run test`：**32 passed**；TypeScript + Vite 生产构建通过。模板测试检查六种版式正文完整、存储兼容、双栏 HTML 以及实际 DOCX XML 两列结构。
- `python -m eval.run_eval --output data/final-evaluation-report.json`：30 条合成评分回归、8 条检索相关性样本，score accuracy=1.000、Recall@3=1.000。不是人工招聘标注、录用率或泛化质量证明。
- Impeccable 确定性检测返回 `[]`。主题正文、次级文字、按钮、提示文本六组颜色对比实算均 ≥4.5:1（约 4.79–11.56）。

## 真实模型：业务技能

复用已保存的合成 Python/FastAPI/pytest 简历与 JD 分析，使用最终 `run_skill`、真实 GLM-5.3-FLASH、独立 SQLite 验收。参数：reasoning_effort=low、60 秒超时、0 次重试、输出预算 1200 tokens。下表是单次结果，不能作为平均性能或费用承诺。

| 能力 | 实际模式 | 耗时 | 输入/输出/合计 Token | 观察 |
| --- | --- | --- | --- | --- |
| JD 拆解诊断 | degraded | 11.83s | 1282 / 369 / 1651 | 1 项未通过来源/输出边界，丢弃后保留原文摘录与学习建议 |
| 简历定制改写 | degraded | 20.37s | 1300 / 420 / 1720 | 1 项未通过核验，丢弃后保留有据提案与练习；提案仍需人工审阅 |
| 面试准备 | online | 12.89s | 1259 / 318 / 1577 | 保留速学路径、生成练习题与回答要点 |

三项均收到有效结构及上游用量；没有为了显示 online 而绕过核验。此前较长 prompt 在 30 秒超时/2400 token 预算下出现超时与截断，已改为精简补充，并增加 `finish_reason=length` 识别。超时没有返回 usage 时，界面里的 0 不代表未计费。

本地复现产物：`data/final-skill-online-acceptance.json`（忽略，不含密钥）。

## 最终 Docker 与 API

- `docker compose up --build -d` 成功；容器 `jian_li-jobfit-1` 健康，`uid=1000(jobfit)`，端口仅绑定 `127.0.0.1:18001`。
- 容器主分析 `e29a928434c84473957047d6e9b675b8`：online、技能覆盖 75、六节点 completed，约 20.25s，970 / 547 / 1517 tokens。输入为合成文本。
- 容器 HTTP 面试技能 `2c82ac69bfac4d6da05046be8c122951`：online，约 19.72s，1251 / 544 / 1795 tokens；结果详情与按分析查询历史均可读。
- 容器重启后上述分析与技能记录仍可读，SQLite 命名卷持久化通过。没有删除数据卷或停止本机已有 8000 端口服务。
- 页面来自容器实际打包资源，标题为“JobFit · 求职作品室”，不是旧缓存页面。18003 曾作为临时前端开发预览；最终演示地址是 **http://127.0.0.1:18001**。

## 浏览器与界面

全站天蓝主题；首页自托管标题字体、白纸简历与原创地平线插画。检查过工作台、经历库、简历编辑/预览、模板与提纲、本地 JD、投递、Agent 分析及历史。

- 1440、390、320 宽度和 844×390 横屏下，文档宽度等于视口宽度；导航在自身容器内横向滚动。
- 六模板可选并进入编辑器；双栏预览保留侧栏/主栏；岗位框架选择与 Markdown 复制通过。
- 浏览器实际下载 DOCX（约 9.8 KB），解压核对 `word/document.xml` 存在真实两列表格，侧栏模板不是仅预览模拟。
- 真实容器报告与面试结果可打开，来源/模式/用量可见，复制成功，下载 Markdown 文件实际保存。
- 修复桌面批量 JD 输入框受固定网格挤压的问题，JD 改为独占一行；输入/切换不会丢失正在编辑的值。
- 键盘焦点、跳到主要内容、移动输入字号与主要触控目标、减少动态偏好已处理；浏览器未记录运行错误。

PDF 使用浏览器打印布局，DOCX 使用 Word 文档模型；保证结构、版式强调色及事实内容，不能保证不同浏览器/Word 引擎逐像素一致或相同分页。

## 审查与安全记录

独立审查见 [Superpowers 审计](reviews/2026-11-18-superpowers-audit.md)。发现的主分析“合法来源 ID 夹带虚构数字”、无据年限/领域、缺失断言、4000 字符前缀边界与畸形 choice 引发 AttributeError 均加入回归并修复。历史每一步是否严格先测试后实现，没有足够证据则不作保证。

候选提交文件扫描未匹配密钥模式；`.env` 未被 Git 跟踪且排除于 Docker 上下文。该扫描不是全历史秘密审计。项目按本地单用户设计，无公网多租户认证隔离。

`npm audit --omit=dev --registry=https://registry.npmjs.org`：运行时依赖 0 漏洞。完整开发依赖审计仍有 6 个 high（picomatch ReDoS 工具链传递链）；没有强制不兼容降级 Vite/Vitest 来消除数字。默认镜像仓库不支持 audit，最终审计显式使用官方 registry。

## 保留限制

- BGE/Chroma/重排可选路径通过受控替身测试，未下载和验收真实模型质量与延迟。默认本地混合检索已实际运行。
- 真实性检查主要基于原文摘录、来源、数字与技术词，不证明任意语义改写都真实；求职者必须审阅提案。
- 真实调用是少量合成样例，没有真实账户压测、人工招聘实验或生产费用基线。
- 已将实现及验收快照 `b33361bbaf5009da7dd3ef1734ca7c5365bb82c9` 推送至 `https://github.com/MaLEVEL/Jian_li.git` 的 `main`；使用 `git ls-remote origin refs/heads/main` 核对远端哈希与本地一致。后续交付记录作为独立文档提交。

## 顶部导航与工作区修正（本轮补充）

用户反馈的模板重叠确实存在。旧三列编辑区只给标题区域约 47–114px，内层标题网格仍要求至少 220px 输入加 44px 保存按钮，同时模板列占 240px。1440px 实际浏览器回归先失败：标题框 x=557.72 / width=220，模板框 x=683.59 / width=240，发生真实交集。此前多视口检查与独立导出审计没有覆盖这个控件碰撞；旧“多视口通过”不能当作无重叠证明，也不能追认整套 Superpowers 历史严格执行。

本轮按用户确认把全站导航移到顶部，移动端改为可展开/收起菜单；所有页面内跳转统一收菜单并聚焦主内容。简历页把版本/版式放到独立工具栏，版本管理与导入按需展开；桌面和手机均使用“编辑 / 预览”标签。标题有明确标签、文本保存按钮与 Enter 快捷操作；预览导出区保留核对门槛。删除了旧侧栏、三列编辑器和冲突的最小宽度规则，几何样式集中于 workspace.css；按钮更新主次层级、44px 目标、间距和按下反馈。

- UI/UX Pro Max 设计系统检索作为参考，保留用户指定天蓝色；Superpowers 使用问题复现、失败回归、修复、验证与独立审查。
- 新 Playwright 回归覆盖 1440/1280/1024/768/390/320px 的长标题、六模板和控件间真实几何交集；覆盖窄屏六模板内部宽度、全站导航、键盘 Arrow/Home/End、移动菜单 Escape、版本切换、编辑保持、导入审阅与实际 DOCX 下载。
- 开发服务浏览器完整套件：**15 passed (48.6s)**。Vitest：**32 passed**。TypeScript 与 Vite 生产构建通过。Impeccable 布局检测返回空发现；它不能替代浏览器证据。
- Docker 版本首轮完整套件 **15 passed (33.8s)**。最后视觉复核另外发现双栏网格因纸张 min-height 而拉高 header（283.89px）；新增第 16 个失败回归后以 align-content: start 修正，避免把绿色测试冒充视觉穷尽。
- Docker 并发构建时曾出现一次原有 DOCX 测试超过默认 5 秒；未放宽超时或断言，构建结束后原命令复跑 **32 passed (1.29s)**。
- 最后一次容器重建后完整浏览器套件：**16 passed (39.3s)**；双栏 header 实测从 283.89px 回落到 **90.34px**（1440/390px）。最后后端完整回归 **89 passed (18.34s)**，使用空调用密钥与临时数据目录，未触发付费请求。
- 最终 `jian_li-jobfit-1` healthy，绑定 127.0.0.1:18001，UID 1000。HTTP JS/CSS 字节与容器内实际文件一致，SHA256 前缀分别为 bc57462aeee7a01c / 1596a1ec9103fde6。本地和 Linux 构建 HTML 的 CRLF/LF 有差异，资源名一致；未以 HTML 文本原样比较失败误判为旧缓存。
- 桌面与手机工作台、编辑、双栏预览同批视觉检查，截图位于 docs/assets/sky-{workspace,editor,preview}-{1440,390}.png。
- 独立审查报告见 [UI 布局审计](reviews/2026-11-18-ui-layout-audit.md)。这是代码独立审查，浏览器由主代理执行，不混称独立浏览器验收。

复现本轮浏览器测试（首次需要安装 Chromium）：

```powershell
cd frontend
npm ci
npx playwright install chromium
npm run test:e2e
```

Windows 已安装 Edge 可设置 `$env:PLAYWRIGHT_CHANNEL='msedge'`。对现有打包服务测试时设置 `$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:18001'`。CI 已接入相同浏览器测试，失败时上传 trace。
