# 离线评估方法

这份文档说明项目的离线评估能证明什么、不能证明什么。普通用户可先看“先看这里”，开发与验收人员再看后面的数据、指标和复现命令。

## 先看这里

- 评估用于检查解析、评分和检索是否发生回归，不是招聘实验。
- 所有评分样本都是项目自行编写的合成数据，不代表真实候选人或真实招聘结果。
- “技能覆盖率”只表示 JD 技能词与简历证据的覆盖程度，不是录用概率。
- 默认评估只运行本地规则，不调用在线模型，不产生 Token 费用。
- 结果和限制会写入 JSON 报告，不能用规划目标或示例数字替代实际输出。

## 普通用户需要知道的结论

本项目可以在本地复现“解析 JD/简历→加权技能评分→素材检索”的回归结果。它能帮助开发者确认代码改动没有破坏既有行为，但不能回答“这个工具能否提高录用率”。

真实模型、BGE 和纯向量对比只有在实际运行后才能报告；未运行时应明确写“未测量”。

---

# 开发者文档

## 目标与所有权

评估用于对离线求职分析管线做可重复的回归检查，不修改生产数据。它直接调用应用实际使用的函数：

- `app.nodes.parsers.local_job`
- `app.nodes.parsers.local_resume`
- `app.tools.scoring.score_match`
- `app.rag.MaterialRetriever(mode=..., persist_directory=...).search`

fixtures 与标签均为项目作者编写的合成数据。“作者编写”这里只表示确定性测试预期，不代表人工标注研究。

## 数据集

评分集包含 30 组不同的 JD/简历对：

- 15 组 `strong_coverage`，覆盖 Python 后端、Agent、RAG、数据、机器学习、测试和部署；
- 15 组 `weak_or_nonmatching`，包括部分 Python 覆盖，以及无关的 Java、前端、移动端、产品、运营和非技术岗位；
- 每个公司名包含 `Synthetic`，每个样本设置 `synthetic: true`，ID 与 `(jd_text, resume_text)` 组合唯一；
- 每组有作者编写的期望分数范围，范围窄于 0–100，独立于计算器输出；
- 强覆盖样本从 70 分起，弱匹配/不匹配样本不高于 45 分。

检索使用另一组 8 个合成素材集与查询。每组有作者编写的 `relevant_ids`，且每个相关 ID 必须存在于该组素材集合中。检索标签与评分样本的 JD/简历不共享。

## 指标

### 分数范围准确率

对每个评分样本：

1. 用生产代码 `local_job` 解析 JD；
2. 用生产代码 `local_resume` 解析简历；
3. 调用生产代码 `score_match(requirements, resume_skills, resume_text)`；
4. 当 `expected_score_range.min <= actual_score <= expected_score_range.max` 时判定通过。

准确率为范围命中的样本数除以 30，并按类别分别报告。单条结果包括实际分数、期望范围、命中与缺失技能和评分明细。fixture 异常按失败样本处理，不伪造指标。

### 别名与精确匹配基线

别名检查比较两种只处理拼写差异的策略：

- 生产路径：调用 `score_match`，允许受控别名扩展；
- 精确基线：仅做大小写不敏感的完整字符串相等，不展开别名。

应命中的别名包括：

```text
sklearn → scikit-learn
postgres → PostgreSQL
k8s → Kubernetes
torch → PyTorch
reactjs → React
```

不应混同的技术包括：

```text
LangGraph ≠ LangChain
Java ≠ JavaScript
PyTorch ≠ TensorFlow
FastAPI ≠ Django
```

### 检索 Recall@k

默认评估实例化真实本地检索器，并报告其 `retriever.mode`，当前默认是 `local-hybrid`：

```text
recall@k = |返回 ID ∩ 作者相关 ID| / |作者相关 ID|
```

报告所有检索样本的平均值。若 BM25 与本地稀疏向量辅助函数可调用，报告还会给出组件级 Recall@k 以比较 `local-hybrid`。辅助函数不可用或迁移时，比较项会关闭并记录限制；不会创建模拟向量基线。

`--rag-mode bge` 会运行实际 BGE/Chroma 路径。可选依赖或模型不可用时命令明确失败，绝不用本地分数替代 BGE 结果。

### 耗时

所有耗时由 `time.perf_counter()` 围绕真实操作测量，分别报告解析/评分、别名、检索和总耗时。耗时随机器与运行状态变化，不作为质量门槛。

## 复现命令

从 `backend/`：

```powershell
..\.venv\Scripts\python.exe -m eval.run_eval --output ..\docs\evaluation-report.json
```

从仓库根目录：

```powershell
$env:PYTHONPATH = 'backend'
.venv\Scripts\python.exe -m eval.run_eval --output docs\evaluation-report.json
```

默认命令写报告后退出 0。需要 CI 门槛时可设置最低分数范围准确率：

```powershell
$env:PYTHONPATH = 'backend'
.venv\Scripts\python.exe -m eval.run_eval --output docs\evaluation-report.json --min-score-accuracy 0.8
```

只有启用门槛时，实测准确率低于阈值才会返回非零。`--retrieval-top-k` 控制 Recall 截断，`--rag-mode` 选择 `local` 或真实 `bge`。

JSON 报告包含 schema 版本、生成时间、数据集来源、评分样本数、实际检索模式、指标、逐样本结果、限制、门槛与实际耗时。

## 限制

- 样本和标签是合成且确定性的，不能估计人工一致率或招聘质量。
- 分数是加权技能字符串覆盖率，不是录用概率。
- 解析器以词法规则为主，只有有限否定过滤，不具备通用句子语义理解。
- 默认离线评估不报告 Token 或费用。
- `local` 模式不运行 BGE，也不声称 BGE 质量或延迟。
- 本地模式不测量独立 dense-vector 基线；稀疏向量比较只能使用实际存在的本地词法辅助实现。
- 耗时是本地观察值，不是受控 benchmark。
