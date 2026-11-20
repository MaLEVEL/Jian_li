# 业务 Skills：求职任务能力包

业务 Skills 是职启云帆 **岗位分析与准备** 页面中的三个任务助手：拆解 JD、定制简历表达、准备面试。它们不是给开发者安装的编码助手，也不会执行第三方脚本。

## 先看这里

- 先完成一次 JD 与简历分析，才能基于该报告运行 Skills。
- 每个 Skills 都绑定一个分析报告，不会自动覆盖已有简历版本。
- 在线结果可能消耗模型 Token；离线模式使用规则结果，不调用模型。
- 所有建议都是草稿。涉及真实经历、数字、职责和技术掌握程度时，必须由你核对。

## 普通用户操作流程

### 第 1 步：准备真实材料

1. 在 **经历库** 中确认项目、工作、技能和教育信息；
2. 在 **简历版本** 中选择或导入一份简历；
3. 如果没有简历文件，可以粘贴文本或先由经历库生成基础简历。

### 第 2 步：运行一次岗位分析

进入 **岗位分析与准备**：

1. 选择简历来源；
2. 粘贴目标岗位 JD，或从机会中心带入；
3. 点击 **运行 Agent 分析**；
4. 等待查看评分、证据、缺口、节点轨迹和警告。

### 第 3 步：选择业务 Skills

在 **岗位分析与准备 → 单岗位深度分析** 完成一次分析后，当前结果下方会显示 **业务技能**。点击任一技能的 **运行**：

| 技能 | 什么时候用 | 你会得到什么 |
| --- | --- | --- |
| JD 拆解与匹配诊断 | 不清楚岗位到底要求什么 | 必需与加分技能、匹配证据、缺口和准备优先级 |
| 真实经历简历定制改写 | 想让已有经历更贴近 JD | 有来源的改写提案、关键词与结构建议、待补证据 |
| 面试速学与预测问题 | 收到面试或要提前复习 | 知识点、复习顺序、预测练习题、回答要点和追问 |

### 第 4 步：阅读结果

结果页会显示：

- 运行模式、模型、耗时和 Token；
- 每项内容的类型；
- 引用的简历或素材来源；
- 标记为“需人工核实”的提案；
- 降级或输出边界警告；
- 本次报告的历史运行记录。

可以使用 **复制 Markdown** 或 **下载 Markdown** 保存结果。

### 第 5 步：人工核对后再使用

重点核对：

- 数字和成果是否有原始证据；
- 是否把 JD 中的要求误写成你的经历；
- 技术名词是否与真实掌握程度一致；
- 年限、职级、团队规模和业务结果是否真实；
- 面试题的答案能否由你的项目证据支撑。

面试题只是练习，不代表目标公司的真实题库。框架和 API 行为应再核对对应版本的官方文档。

## 常见问题

### 为什么没有可运行的 Skills？

需要先选择一个已完成并保存的分析报告。打开分析历史后，Skills 会绑定到该报告。

### 为什么显示降级？

模型可能超时、限流、返回无效结构或未通过来源检查。系统会保留可用规则结果和警告，不会把失败伪装成完全成功。

### 为什么没有 Key 也能运行？

离线规则模式会提供可解释的基础结果。需要模型深度补充时，再到右上角 **AI 服务配置** 填写任意 OpenAI Chat Completions 兼容接口；智谱只是默认示例。

### 运行 Skills 会修改简历吗？

不会。它只生成审阅稿和分析记录，不会自动覆盖简历版本。

---

# 开发者文档

## 架构

业务 Skills 位于 `backend/app/business_skills/`：

```text
business_skills/
├── registry.py        受控技能目录与版本
├── runtime.py         输入构建、模型调用、结果校验与持久化
├── knowledge.py       面试知识卡
├── jd-diagnosis/      技能说明与输出约束
├── resume-tailor/
└── interview-prep/
```

每个能力包包含 `SKILL.md`，说明任务、允许输出和真实性限制。HTTP 请求只能引用注册表中的已知 `skill_id`，不能提供任意文件路径、命令或可执行插件。

## 运行契约

```http
POST /api/skills/{skill_id}/run
Content-Type: application/json

{ "analysis_id": "已保存的报告 ID" }
```

运行时会从分析记录中加载保存的 JD、简历、评分、证据和素材快照，再结合对应 `SKILL.md` 生成结构化结果。响应包括：

- `skill_id`、`skill_version`、`analysis_id`；
- `mode`、`model`、`duration_ms`；
- `usage.prompt_tokens`、`completion_tokens`、`total_tokens`；
- `sections[]` 与 `sources[]`；
- `warnings[]`；
- 每项的 `source_ids` 与 `review_required`。

API：

- `GET /api/skills`
- `POST /api/skills/{skill_id}/run`
- `GET /api/skill-runs?analysis_id=...`
- `GET /api/skill-runs/{run_id}`

不存在的 Skill 或分析报告返回 404，请求体不符合结构返回 422。结果自动写入 SQLite `skill_runs`，同时保存本次生成结果、来源快照、模式、警告、耗时与 Token。`sources` 最多 30 个，每个来源内容最多 50,000 字符；每个结果条目最多 4,000 字符，每个分节最多 20 条。

## 来源与真实性约束

- 简历改写证据只能来自原简历或用户素材；JD 只代表岗位要求。
- 不得把 JD 中的技能、数字或职责当成候选人事实。
- 所有模型条目必须引用当前运行中已知的 `source_ids`。
- 事实项必须给出能在来源中逐字找到的引文。`resume-tailor` 的提案会检查数字、技能词、未知英文词和来源；学习和练习项只做有限个人经历话术拦截。不同输出类型使用不同检查，不能理解为所有语义都经过统一真实性验证。
- 未通过边界检查的项被丢弃，并产生明确 warning。
- 规则检查不能证明任意语义改写的全部真实性，因此 `review_required` 必须保留到 UI。

较早的分析报告可能缺少原始输入快照。运行时只能使用已保存的技能、项目和证据片段，并提示上下文不完整；重新分析后重跑可获得更完整上下文。

## 模式矩阵

| 场景 | mode | 行为 |
| --- | --- | --- |
| 无密钥或 `YUNFAN_LLM_MODE=offline` | `offline` | `model=offline-rules`，不调用模型，Token 为 0 |
| 在线输出全部通过校验 | `online` | 确定性离线分节 + 模型补充 |
| 部分模型结果被丢弃 | `degraded` | 保留通过校验的模型结果与离线结果，返回 warning |
| 模型失败或全部输出未通过 | `degraded` | 只保留安全离线结果 |

## 降级策略

- 无完整 provider 配置：使用明确标记的离线规则结果；
- 上游超时、限流、认证失败或无效 JSON：返回安全回退并保留 warning；
- `401` 不重试；
- 达到输出预算或 `finish_reason=length`：立即降级，不用截断后冒充完整结果；
- 生成项添加标题和来源前缀后超过 4000 字符：丢弃该生成项并提示，不截断后伪装成完整事实；
- 主分析 Token 不包含之后单独运行的 Skills；Skills 每次运行独立记录用量。

## Token 与兼容配置

业务 Skills 输出预算为 1200 tokens。Compose 可透传：

```text
YUNFAN_TIMEOUT_SECONDS
YUNFAN_MAX_RETRIES
YUNFAN_REASONING_EFFORT
```

默认不发送 `reasoning_effort`。只有服务商明确支持时才填写 `low`、`high` 或供应商允许的值。超时且未收到 usage 时，界面中的 0 只表示未知，不能解释为免费调用。

## 新增 Skill 规范

新增任务时至少需要：

1. 一个稳定、语义清晰的 `skill_id` 与版本；
2. 目录内 `SKILL.md`，说明输入、结构化输出、证据要求和禁止事项；
3. 受控 registry 条目；
4. Pydantic/schema 校验与安全回退；
5. 来源映射和真实性规则；
6. API、离线模式、在线失败、截断与持久化测试；
7. 明确 Token 预算和 UI 文案。

只新增 Markdown 文件不会自动获得执行权限。

## 测试

```powershell
.venv\Scripts\python.exe -m pytest backend/tests/test_business_skills.py backend/tests/test_grounding.py backend/tests/test_interview_knowledge.py -q
cd frontend
npm.cmd test -- --run
```

覆盖重点：无 Key 离线路径、有效在线结构、无效 JSON、超时、401、输出截断、来源缺失、超长项丢弃、报告 ID 隔离与历史读取。

## 调研来源

任务划分参考了：

- [resume-agent-skills 的 resume-tailor](https://github.com/vignzpie/resume-agent-skills/blob/main/resume-tailor/SKILL.md)
- [Reactive Resume 的 interview-prep](https://github.com/reactive-resume/reactive-resume/blob/main/plugins/reactive-resume/skills/interview-prep/SKILL.md)

本项目的能力包、运行代码、schema 和 UI 为独立实现，未安装其 CLI、MCP 依赖，也未声称兼容其全部工作流。

内置知识卡面向复习，技术行为以官方文档为准，例如：

- [Python asyncio](https://docs.python.org/3/library/asyncio-task.html)
- [FastAPI 依赖注入](https://fastapi.tiangolo.com/tutorial/dependencies/)
- [Docker 卷](https://docs.docker.com/engine/storage/volumes/)
