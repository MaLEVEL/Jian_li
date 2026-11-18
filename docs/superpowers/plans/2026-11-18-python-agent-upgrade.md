# Python Agent Upgrade Implementation Plan

**Goal:** 将现有 JobFit React 应用升级为有 Python/LangGraph/RAG 后端的可验证求职作品。
**Architecture:** FastAPI + SQLite 管理素材与报告，LangGraph 编排解析、评分、检索和建议。独立 Agent 工作台复用现有简历和经历数据。
**Tech Stack:** Python, FastAPI, LangGraph, httpx, BM25, optional Chroma/BGE, React, TypeScript, Docker.
**Spec:** ../specs/2026-11-18-python-agent-design.md

## Global Constraints
- 保留 React 和既有功能；密钥只在后端 .env；明确在线/离线与检索模式。
- 不伪造个人经历、评估数值、人工标注或第三方调用成功。
- 最多 20 条批量 JD，文件最多 2MB；SQLite 持久化；错误可恢复。

## Task 1: Agent core and API
- [x] 为技能别名、加权评分、工作流及 API 编写失败测试。
- [x] 创建 backend/app/{config,schemas,store,llm,graph,main}.py 和 nodes/tools，验证请求与上游 JSON，跟踪每个节点、Token、耗时与降级。
- [x] 跑通 pytest，并用真实 HTTP 验证。

## Task 2: Material retrieval (independent)
- [x] backend/app/rag 提供 MaterialRetriever.search(query, materials, top_k=5) -> list[dict] 与 mode 属性。
- [x] BM25+稀疏向量+RRF 基础实现；可选 Chroma+BGE+CrossEncoder 路径，引用不丢失（模型下载与实际质量验证仍待后续）。
- [x] 测试中文/别名/无关内容/删除更新一致性/缺失可选依赖。

## Task 3: React Agent workspace (independent)
- [x] 增加 agentTypes.ts、agentApi.ts、AgentWorkspace.tsx 和样式，使用设计文档 API 合约。
- [x] 单条/批量/素材/历史；加载、失败、空状态、CSV、上传、引用、节点轨迹及模式可见。请求取消未纳入本次交付。
- [x] 接入现有 App 导航与简历经历数据；运行 Vitest、构建及浏览器验证。

## Task 4: Evaluation, packaging, handover
- [x] 创建 30 条合成评分回归样本与检索相关性样本，输出评分区间命中率、别名命中率、检索 Recall@k 和耗时。
- [x] Dockerfile、compose、.env.example、CI、Windows 启动文档和 README 架构/面试说明。
- [ ] 跑全部验证，审查差异和密钥排除，分阶段 commit 并 push 到用户仓库，核对远端提交。
