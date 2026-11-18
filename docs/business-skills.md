# 业务 Skills：求职任务能力包

这些技能在 JobFit 后端运行，面向使用产品的求职者。它们不是给编码助手安装的开发指南，也不会执行第三方脚本。

## 使用方式

1. 在 Python/Agent 工作台完成一次 JD 与简历分析，或打开分析历史。
2. 根据需要选择 JD 拆解、简历定制或面试准备并运行。
3. 查看结构化结果、来源、模型模式与本次 Token；复制或下载结果，再人工核对。

每次技能运行均绑定一个已保存的分析 ID，后端从该分析及素材快照取上下文。切换到另一份报告时，展示对应报告的运行历史。技能运行不会自动覆盖简历版本。

## 三种任务

| 技能 ID | 业务用途 | 预期输出 |
| --- | --- | --- |
| jd-diagnosis | 把 JD 拆成可以逐项准备的要求 | 必需与加分技能、匹配证据、缺口与准备优先级 |
| resume-tailor | 用岗位语言组织已有真实经历 | 有来源的改写提案、关键词与结构建议；无证据项作为补充材料任务 |
| interview-prep | 快速准备目标岗位面试 | 知识点、复习顺序、预测练习题、回答要点与追问 |

面试问题是模型或规则生成的练习，不代表目标公司实际题库。知识点用于复习，版本敏感的框架行为应再核对对应版本的官方文档。

## 运行与来源

`backend/app/business_skills/` 中每个能力包包含 `SKILL.md`，描述任务、输出和限制；受控 Python 注册表选择已知技能，Markdown 指令参与模型任务。请求不能提供任意文件路径、命令或可执行插件。

有可用密钥时使用配置的智谱兼容模型，无密钥时提供明确标记的离线结果。模型失败或输出无法验证时，返回降级说明和安全回退。技能额外调用模型并计入自身 Token，分析报告的 Token 不包含之后的技能运行。

简历提案的证据来自原简历或真实素材，JD 只代表岗位要求；不能把 JD 写的技能当作候选人的经历。模型输出的引文必须在相应来源中出现。数字、技术词与个人经历断言会经过规则检查；这些检查不能证明改写的全部语义。通过检查的提案仍需本人核实。

较早的报告可能没有原始输入快照，后端只能使用已保存的技能、项目与证据片段，并提示上下文不完整。重新分析可获得完整上下文。

## API

- `GET /api/skills`：业务技能目录和版本。
- `POST /api/skills/{skill_id}/run`：请求 `{ "analysis_id": "报告ID" }`，返回来源、分节结果、模式、警告、耗时和 Token。
- `GET /api/skill-runs?analysis_id=报告ID`：读取该报告的技能运行历史。
- `GET /api/skill-runs/{id}`：读取已保存的技能结果。

新能力应先明确输入、结构化输出和来源约束，再加入受控注册表与测试。单纯添加一个 Markdown 文件不会自动获得代码执行权限。

## 调用预算与兼容配置

每次业务技能只生成少量在线补充，固定输出预算为 1200 tokens。返回 `finish_reason=length` 时立即降级，保留上游已返回的实际 Token 用量，不对确定性截断反复重试；超时无法拿到用量时，不能把展示的 0 解释为未计费。

Compose 透传 `JOBFIT_TIMEOUT_SECONDS`、`JOBFIT_MAX_RETRIES` 与可选 `JOBFIT_REASONING_EFFORT`。默认不发送 reasoning_effort；仅在服务商明确支持时填写。此次 GLM-5.3-FLASH 验收使用 `low`、60 秒超时、0 次重试，实际结果及警告以验证记录为准，未把 health 的 online 当成调用成功证明。

主分析的有据输出只追加通过来源核对的逐字摘录；业务改写提案会检查来源、数字和技术词，但仍不构成通用语义真实性证明，必须人工审阅。生成的学习项/问题添加前缀后若超出 4000 字符则丢弃并告知，避免因超长导致 500；超长原文保留于来源，不截断后冒充完整事实。

## 调研来源与实现方式

调研过 [resume-agent-skills 的 resume-tailor](https://github.com/vignzpie/resume-agent-skills/blob/main/resume-tailor/SKILL.md) 和 [Reactive Resume 的 interview-prep](https://github.com/reactive-resume/reactive-resume/blob/main/plugins/reactive-resume/skills/interview-prep/SKILL.md)。前者围绕职业事实档案、JD 缺口和定制草稿；后者围绕真实经历、能力映射和面试问题准备。本项目采用这些任务划分作为参考，能力包与运行代码为当前项目编写，未安装其 CLI、MCP 依赖或声称兼容其全部工作流。

内置知识卡面向复习，技术行为仍以官方文档为准，例如 [Python asyncio](https://docs.python.org/3/library/asyncio-task.html)、[FastAPI 依赖注入](https://fastapi.tiangolo.com/tutorial/dependencies/) 和 [Docker 卷](https://docs.docker.com/engine/storage/volumes/)。
