# 职启云帆 V1 求职闭环使用指南

这份指南回答两个问题：每天先做什么，以及一条机会如何从“刚发现”走到“面试或结束”。系统负责整理、提醒和准备材料；投递、沟通和最终发送始终由你手动确认。

## 先看这里

- “机会”和“投递记录”不是一回事：机会用于判断和管理岗位，投递记录用于保存已经发生的投递与反馈。
- 只有你点击阶段按钮，机会才会推进；打开链接、复制 JD 或 AI 分析都不会自动改变状态。
- 拉黑公司不会删除数据。被拉黑的公司在需要时可以重新显示并恢复。
- 今日任务来自机会的“下一步”和截止时间，逾期任务会优先出现。

## 每天怎么使用

### 第 1 步：打开“今日”

顶部导航进入 **今日**，先处理三类内容：

- **今天做什么**：逾期、今天和未来的任务；
- **下一场**：所有尚未开始的面试中最近一场，可直接打开面试包；
- **需要继续推进**：所有在途机会及下一步。

### 第 2 步：判断机会是否值得投入

进入 **机会中心 → 机会漏斗**。每个岗位会显示当前阶段、来源、关联简历和下一动作。

阶段顺序：

```text
新发现 → 已收藏 → 定制中 → 已投递 → 沟通中 → 面试中 → Offer
                    ↘ 不适合 / 已关闭
```

| 阶段 | 可以做什么 |
| --- | --- |
| 新发现 | 阅读 JD，判断岗位、团队方向和硬性条件 |
| 已收藏 | 暂时保留，稍后分析或确认优先级 |
| 定制中 | 选择简历、带入定制、按 JD 调整表达 |
| 已投递 | 记录手动投递结果并安排跟进 |
| 沟通中 | 保存与招聘方沟通后的进展 |
| 面试中 | 打开面试包并准备项目、技术、行为问题 |
| Offer | 比较条件、记录最终决定 |
| 不适合 / 已关闭 | 退出有效漏斗；可撤销并恢复 |

点击“推进至 …”进入下一阶段。“不适合”会退出当前漏斗，“撤销状态”可以回到上一步。系统不会因为你在 BOSS 页面点击了岗位就认定“已投递”。

### 第 3 步：使用机会操作条

机会卡片下方提供：

- **用 JD 匹配**：把岗位描述带入分析流程；
- **选择简历 / 更换简历**：为这个机会指定简历版本；
- **带入定制**：进入针对该岗位的简历准备；
- **安排跟进**：选择下一次行动时间；
- **拉黑公司**：隐藏同公司的机会；
- **面试包**：仅在“面试中”等可用状态出现；
- **查看来源**：打开原始岗位链接。

如果公司已经进入黑名单，该公司全部机会卡片会默认隐藏，并从首页待办和面试提醒中排除。历史数据不会被删除；点击 **显示黑名单** 查看原因，再用 **恢复机会** 恢复整家公司。

### 第 4 步：手动粘贴或导入 CSV

在机会中心展开 **手动粘贴或 CSV 预览**。必须先生成预览，确认后再导入。

手动粘贴每行一个机会：

```text
公司 | 岗位 | 城市 | JD
```

示例：

```text
云帆科技 | AI Agent 工程师 | 上海 | 负责 Python Agent、RAG 和 FastAPI 服务开发。
```

CSV 必须包含表头：

```text
company,title,description
```

可选列：

```text
location,source,stage,nextAction,nextActionAt,channel,contact,notes,url
```

预览会逐行检查必填字段、阶段、URL 和时间格式。任意一行有错误时，“确认导入”都会禁用；修正全部错误后，整批数据才会写入。

### 第 5 步：理解重复提示

- 相同规范化链接、相同平台岗位 ID 会被视为同一个岗位并自动合并；
- 公司名和岗位名相同、但缺少链接或平台 ID 时，只显示“疑似重复”；
- 疑似重复仍可独立保存，因为同一公司可能同时发布多个相似岗位。

自动合并保留原机会的阶段、下一步、渠道、联系人和备注；JD、薪资、城市与来源快照按较新记录更新，旧记录缺失的联系信息才会补全。

### 第 6 步：从 BOSS 收件箱加入机会

从 **机会中心 → BOSS 职位收件箱** 可以：

- **加入机会漏斗**：把采集到的职位变成可管理机会；
- **用这份 JD 匹配**：带入岗位分析；
- **回到 BOSS**：打开原始页面；
- **删除**：只删除本机收件箱记录，不影响 BOSS。

扩展只读取你当前打开的 BOSS 页面中已经显示的内容，不自动投递。安装方法见 [BOSS 接入教程](boss-integration.md)。

### 第 7 步：跟进和准备面试

首页 **今日** 汇总逾期、今天和未来的下一步。进入 **跟进** 可以查看投递记录与关联行动：

1. 查看投递记录和关联任务；
2. 完成后点击“完成”，或重新选择跟进时间；
3. 机会处于“面试中”时，可以打开面试包；
4. 检查准备清单、可能问题、项目案例和要反问面试官的问题。

面试包完全由前端规则生成，不调用模型，包含岗位摘要、能力缺口、技术题、项目题、行为题、准备清单和当前简历来源。需要模型生成的复习建议时，应另外使用“岗位分析与准备”中的面试业务 Skill。

### 第 8 步：管理简历与导入导出

右上角只保留 **AI 服务配置**，不再有全平台“数据设置”。

- **简历版本**：上传 PDF/TXT/DOCX、核对解析结果、编辑、优化、匹配、下载 DOCX、打印 PDF。单个文件不超过 2 MB，PDF 最多 20 页且必须包含可提取文字；扫描版 PDF 需先 OCR。可选照片支持 JPG/PNG/WebP，会在本地裁成 3:4、清除元数据并压缩为不超过 150 KB 的 JPEG，可选择左侧或右侧，也可移除；
- **机会中心**：粘贴或 CSV 导入，并按当前筛选导出机会 CSV；
- **跟进**：按当前筛选导出投递记录 CSV。

若另一台设备已更新 workspace，当前页会提示选择“保留本地并覆盖服务器”或“载入服务器版本”。本地修改不会在提示出现时被静默删除。

## 数据保存在哪里

- workspace：经历、简历、照片、机会、筛选视图和跟进状态；
- SQLite：素材、分析历史、Skills 结果与 BOSS 原始职位池；
- localStorage：当前浏览器中的 workspace 缓存与 AI 服务配置；
- AI Key：只保存在当前浏览器，不随 workspace 跨设备同步；
- 系统通知、日历事件与后台推送：当前未实现。

---

# 开发者文档

## 状态模型

`OpportunityStage` 包含九个稳定值：

```text
new, saved, tailoring, applied, communicating, interviewing, offer, unsuitable, closed
```

页面显示文案定义在 `frontend/src/components/OpportunityCenter.tsx`，规范化管道位于 `frontend/src/opportunityPipeline.ts`。旧数据中的 `preparing`、`customizing`、`screening`、`rejected` 等值会映射到当前阶段。

有效漏斗阶段为前七个；`unsuitable` 与 `closed` 是退出状态。阶段变化同时重建默认下一步：

| 阶段 | next action kind | 默认动作 |
| --- | --- | --- |
| `new` / `saved` | `review` | 判断岗位是否值得投递 |
| `tailoring` | `tailor-resume` | 按 JD 定制简历 |
| `applied` / `communicating` | `follow-up` | 跟进招聘进展 |
| `interviewing` | `prepare-interview` | 准备面试问题与项目案例 |
| `offer` | `compare-offer` | 比较 Offer 并确认条件 |

## 去重与 upsert

`createOpportunitySourceKey` 的优先级：

1. 规范化 `sourceUrl` → `source-url:<hash>`；
2. 平台名称 + `sourceJobId` → `source-job:<hash>`；
3. 来源 + 公司 + 岗位 + 城市 → `job-identity:<hash>`。

`recordsRepresentSameOpportunity` 只对以下强标识返回 true：

- 双方存在相同的非 `job-identity:` `sourceKey`；
- 双方规范化 URL 相同；
- 双方来源平台与岗位 ID 相同。

弱身份键用于 `findSimilarOpportunities` 生成预览提示，不进入自动 upsert 判定。`mergeOpportunityRecords` 保留已有机会的 `id`、`stage`、`nextAction` 与最早创建时间；较新记录补充 JD 快照及其他字段。

## 黑名单

- 公司键由规范化公司名生成；
- 拉黑会把 `blacklistedAt`、`blacklistReason` 等状态同步到同公司记录；
- 机会页、今日任务和提醒会过滤命中的公司键；
- 恢复操作按公司键批量清除黑名单字段；
- 不删除机会、投递记录或历史分析。

## CSV 与 workspace 数据流

1. `parseOpportunityCsv` 先校验表头、必填字段、枚举、URL、日期时间与批量限制；
2. 预览阶段对已存在机会和同批记录执行相似性提示；
3. 用户确认后，`upsertOpportunity` 应用强标识合并规则；
4. React 状态通过 `PUT /api/workspace` 写入本机 SQLite，并保留浏览器缓存；
5. revision 冲突由页面提示用户选择本地覆盖或载入服务器版本。

provider settings 使用独立的 localStorage key，不出现在 workspace 请求体中。

## 今日任务与面试包

`buildOpportunityTaskGroups` 按 `nextAction.dueAt` 分组为 overdue、today、future、upcoming 和 next7Days，并排除黑名单与已完成动作。日期解析支持页面产生的本地 ISO 时间。

`generateRuleBasedInterviewPackage` 从机会、关联 application/report 中提取匹配和缺失技能，生成准备清单、技术题、项目题、行为题、项目故事、反问和风险提醒。它是确定性规则输出，不声称是目标公司的真实题库。

## 页面级导入导出

- 机会 CSV 由 `OpportunityCenter` 基于当前筛选生成；
- 跟进 CSV 由投递记录生成；
- 简历 DOCX 在浏览器中使用 `docx` 模型生成，照片以 JPEG 内嵌；
- PDF 使用浏览器打印，不保证跨浏览器或 Word 引擎逐像素一致；
- 任意导出都不会同步或上传 provider API Key。

## 相关测试

- `frontend/src/opportunityPipeline.test.ts`
- `frontend/src/components/OpportunityCenter.test.tsx`
- `frontend/src/storage.test.ts`
- `backend/tests/test_workspace.py`
- `backend/tests/test_boss_jobs.py`

前端测试：

```powershell
cd frontend
npm.cmd test -- --run
npm.cmd run build
```

后端 workspace 与 BOSS API：

```powershell
.venv\Scripts\python.exe -m pytest backend/tests/test_workspace.py backend/tests/test_boss_jobs.py -q
```
