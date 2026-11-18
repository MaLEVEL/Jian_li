# Superpowers 最终集成审计（2026-11-18）

## 交接结论

**最终复核通过：旧 P1/P2/P3、4000 字符前缀边界，以及新增畸形 choice P2 均已关闭。已审范围内没有未关闭的 P1/P2，可交接父代理执行最终完整测试与 Docker 重建。** 这是对已审风险与回归证据的结论，不是穷尽证明或对最后镜像重建结果的预先确认；本审计范围收敛。

基线 HEAD：bdb323cd5960c92019f973ce75ef3c4c77ec58e5；对象包括工作区尚未提交的最终集成代码。choice 修复前最近一次独立完整后端复跑 **85 passed in 8.61s**、Ruff 通过、git diff --check 退出码 0（仅行尾转换警告）。本轮导出版式交接后的独立前端验证 **32 passed**，TypeScript 和临时目录生产构建通过。父代理最后修改批量 JD 宽度 CSS 与打印标题底线；这些最后修改后的全测及 Docker final rebuild 由父代理执行，不以此前构建冒充最后版本凭证。

实现只读；唯一授权仓库写入为本文件。未改实现、测试或配置，未提交、推送或调用付费模型。没有要求补造历史 TDD 日志。

## 新增 P2 最终关闭记录

### [P2，已关闭] 畸形 choices 首项绕过降级

- 原缺陷位置：backend/app/llm.py 第 72–73 行直接对未校验的 choice 调用 get。此前独立探针复现四类 AttributeError，真实本地 API 为 500、无历史；保留该红态记录，不将修复后状态改写为从未发生。
- 当前代码已显式要求 choices 为非空 list、choice 与 message 为 dict；畸形情况抛出受捕获的 ValueError，最终转换为 ModelUnavailable。用量累加仍在结构校验之前，finish_reason=length 的明确截断处理保留。
- 独立定点复跑 backend/tests/test_llm.py：**14 passed in 0.41s**；Ruff 对 backend/app/llm.py 与 backend/tests/test_llm.py 检查通过。四种新增参数化 choice（None、空 list、invalid 字符串、整数 5）均断言 ModelUnavailable、仅一次请求、保留 11/7/18 tokens。原截断不重试与实际用量断言继续通过。
- 修复后独立重放真实本地 API：MockTransport + create_app + TestClient + 四个独立临时 SQLite；四类 choice 均 **POST /api/analyze 200、mode=degraded、prompt=12/completion=6/total=18**。每类历史均返回一条对应分析，历史用量与响应完全一致，原 500/无历史不再复现。全程无外网或真实密钥。
- 关闭判断：代码、定点回归、API 降级及用量/历史证据一致，**此 P2 关闭，无需再次派修**。父代理交接 Curie 完整后端 89 tests 与 Ruff 通过；本审计亲自运行的是上述 14 项定点测试，最后完整 89 项复跑由父代理执行。

## 已关闭发现与负向证据

| 原问题 | 当前结论与独立证据 |
| --- | --- |
| 原 P1：合法来源 ID 夹带虚构数字建议 | 已关闭。backend/app/graph.py 第 127–146 行校验 source_quote 与建议是否为引用素材原文，无据建议丢弃并 degraded。旧 API 攻击输入重放后，10 年、5000 台、900% 均未保留；历史与响应一致。有据摘录正例仍保留。 |
| 原 P2：无据年限与领域 | 已关闭。backend/app/nodes/parsers.py 第 35–53 行要求模型年限与本地原文抽取一致，领域须出现于原 JD。旧 API 探针中的 55 年、unsupported-domain 被清除；有据 3 年与金融风控正例保留。 |
| 原 P3：个人伪经历测试缺断言 | 已关闭。backend/tests/test_business_skills.py 第 343 行已断言“伪经历练习”不进入结果。 |
| Curie：4000 字符 study/question 加前缀导致 500 | 已关闭。business_skills/runtime.py 第 315–334 行在追加前缀前判断长度。两种 kind 均探测无前缀 4000 拒绝、恰好余量接受、已有前缀总长 4000 接受；API 回归通过。超长原始事实使用明确超限提示，不静默截成事实片段。 |
| sources 分组与 numeric 引用注入 | 前轮已修复并独立核验，不重新列为缺陷。测试 SQLite 已持久化注入 source，数字测试实际走到核验逻辑。 |

仅进程内变异，没有修改仓库文件：去掉主分析原文约束时对应 grounding 测试失败；去掉元数据约束时对应正负例测试失败；禁用个人过去经历 matcher 时补全后的个人经历测试失败。前轮禁用数字提取时两项 numeric 测试均失败。以上证明当前回归对保护失效敏感，**不证明历史测试先于实现的时间顺序**。

## 独立自动化与集成检查

- 最终 choice 修复交接后，独立定点模型客户端回归 **14 passed in 0.41s**、相关 Ruff 通过，四种 API 降级/用量/历史探针通过。Curie 报告完整后端 **89 passed**；独立完整后端最近实跑为修复前的 85 项，最终完整 89 项由父代理复跑，不混淆两者证据。
- 后端最新执行：临时 JOBFIT_DATA_DIR、空 JOBFIT_API_KEY、local 检索、禁用字节码及 pytest cache；python -B -m pytest -q -p no:cacheprovider，basetemp 位于系统临时目录，结果 **85 passed in 8.61s**，退出码 0。
- Ruff check --no-cache backend/app backend/tests backend/eval：All checks passed。git diff --check：退出码 0，仅 LF/CRLF 警告；旧 graph EOF 格式问题已消失。
- 前端在 Harvey 导出版式交接并停止修改后：src/config TypeScript 检查退出码 0；Vitest **4 files / 32 passed in 1.59s**；Vite 生产构建 **1581 modules transformed，610ms**，退出码 0。缓存和构建输出位于系统临时目录，不写仓库 dist。使用已安装模块和等价生产配置；实际 vite.config 的额外配置仅为开发 server/proxy。
- 合成评估：**30 条评分 accuracy=1.000，8 条检索 Recall@3=1.000**，local-hybrid，阈值通过、退出码 0，结果写临时目录。这不是招聘质量、录用率或泛化效果证明。
- 最新 JD 宽度 CSS、打印标题从左侧色条改为底线后，完整测试和 Docker final rebuild 由父代理负责。此次报告不继续扩大样式审查范围。

## 简历版式与导出高风险复核

复核 frontend/src/resumeLogic.ts 第 686–924 行及 templateCatalog.test.ts 第 231–319 行：

- 六模板、四岗位框架接入原编辑、预览与导出链路。sidebar 的 HTML 为 32/68 真双栏网格；DOCX 为固定列宽 3100/6400 的真实无边框两列表格；其余五模板为一栏，强调色来自 catalog。
- HTML 文本转义，章节使用相同的有序生成逻辑；PDF 打印调用相同 renderResumeHtml，代码路径一致。
- 回归验证全部模板正文保留；DOCX 测试实际经过 Packer、解压生成文件并核查 word/document.xml 的双列、无边框、正文事实和强调色，不是只断言模拟函数调用。
- App 的人工审阅确认门槛、导出异常提示仍在；AgentWorkspace 的 report.id 重挂载隔离仍在。高风险入口抽查未发现本轮功能删除；没有穷尽验证所有 UI 控件。
- 上述证据支持结构及事实内容一致，不能保证各浏览器打印与 Word/WPS 的逐像素、分页一致。本审计没有独立进行 Word/WPS 视觉验收。

## 真实模型与 Docker 证据层级

本审计读取 data/final-skill-online-acceptance.json，核验三项结果符合当前结构、source ID 可解析、tokens 合计一致、proposal 保持人工审阅标记。真实请求由父代理执行，本审计未重复付费调用、未独立观察网络过程。

| 业务技能 | 实际模式 | 父代理实测耗时 | 输入/输出/总 tokens | 保存结果 |
| --- | --- | --- | --- | --- |
| jd-diagnosis | degraded | 11.83s | 1282 / 369 / 1651 | 1 项丢弃，保留 5 节，包括在线摘录与学习建议 |
| resume-tailor | degraded | 20.37s | 1300 / 420 / 1720 | 1 项丢弃，保留 5 节及有据 proposal |
| interview-prep | online | 12.89s | 1259 / 318 / 1577 | 保留 4 节 |

使用合成数据、最终 run_skill、独立 SQLite。degraded 如实保留，不为强制 online 绕过核验或无意义重跑。

已读取父代理更新后的 docs/verification.md，其最终环境记录包括：

- Docker build/up 成功、容器健康、uid=1000、仅绑定 127.0.0.1:18001。
- 主分析 e29a928434c84473957047d6e9b675b8：online、75 分、1517 tokens、20.25s、六节点完成。
- HTTP interview 2c82ac69bfac4d6da05046be8c122951：online、1795 tokens、19.72s，详情与历史可读。
- 容器重启后两类记录仍可读；真实容器页面复制、Markdown 下载成功，父代理报告实际文件约 10KB。验证文档还记录了多视口检查、模板/框架切换及浏览器无运行错误。

这些属于**父代理执行并文档化的验收证据**，本审计核对了文档与相关接口/持久化实现，未自行重跑 Docker、操作浏览器或重启父代理服务。最后 CSS 后镜像重建仍以父代理最终记录为准。

## 流程证据与不能证明之处

- 阅读并应用 using-superpowers、requesting-code-review（含 reviewer 模板）、verification-before-completion、test-driven-development；作为已派遣审查者，不再派遣下级 reviewer。
- 六个本地阶段提交存在：7a1392d、f05833f、4306892、52adf79、81c1f50、bdb323c。最终集成为未提交工作区；本审计未 commit/push、未联网核对远端。
- Noether/Curie 红绿先后由父代理交接；当前代码、绿测与进程内变异提供独立行为证据。记录不足以逐项重建历史顺序，不据此指控违反 TDD，也不要求补历史 TDD。
- 此前确认 .env 被 Git 与 Docker ignore 排除，未读取/打印密钥正文；没有全 Git 历史秘密扫描。父代理文档记录候选文件密钥模式扫描、运行时 npm audit 0、开发工具链 6 high；本审计未独立联网审计依赖，不将文档记录升级为独立安全结论。
- 已审代码存在参数化 SQLite、固定 skill allowlist、HTML 转义、上传大小边界、CSV 前缀转义及 loopback/非 root 部署。项目仍为本地单用户，无公网多租户隔离；health online 是配置状态，不等于外部模型连通性证明。
- 默认本地检索已实跑；BGE/Chroma/重排仅受控替身，未下载真实模型验收质量和时延。词法、数字、摘录校验不能证明任意语义改写都真实；少量真实合成样例不能推导生产费用、平均时延或招聘效果。

## 最终交接

1. 所有已列发现已关闭，已审范围内没有未关闭 P1/P2；审查结论可交接父代理，无新增派修项。
2. 父代理负责最终完整 89 项后端测试、最后前端样式后的全测与 Docker final rebuild，并将实际结果写入验证文档；最终提交/推送由父代理按其验收结果决定。
3. 本审计已收敛交付，仅更新本报告，未执行付费调用、commit 或 push。
