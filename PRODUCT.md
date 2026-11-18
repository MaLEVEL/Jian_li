# JobFit 求职作品室

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

正在准备校招、实习、社招、技术研发、产品运营、设计创意、管理咨询或学术科研岗位的求职者；项目本身重点展示 Python / Agent 全栈能力。当前以本地使用与作品演示为交付范围。

## Product Purpose

整理真实经历、编辑多份简历、拆解目标 JD、准备面试并记录投递。用户希望项目本身也能成为展示 Python/Agent 工程能力的作品。

## Capabilities and Constraints

保留 React 的经历库、简历编辑与导出、投递记录；增加 Python/FastAPI/LangGraph 分析、素材检索、可解释技能覆盖评分、批量与历史。运行时业务技能包括 JD 诊断、简历定制与面试准备。模板包含 8 类人群各 2 款的视觉版式、10 类岗位内容框架，以及单页/双页、字体、字号、行距、页边距和主题色设置；框架不能作为候选人的真实经历。

密钥仅在服务端；原有简历数据保存于浏览器，Agent 数据保存于本地 SQLite。在线调用把输入发送到配置的模型服务。无密钥与失败降级必须明确展示。合成评估不能描述成人工招聘实验。

## Brand Commitments

用户于 2026-11-18 明确选择活泼的个人作品集风格，全站统一去掉 AI 模板感。随后明确指定天蓝色主题，希望像诗和远方、轻盈且有希望；采用 UI/UX Pro Max 指导配色、交互与验收。保持产品任务可读、控件可用；参考相近 GitHub 项目的有用功能，记录出处，内置模板以原创数据实现。

## Evidence on Hand

现有代码、docs/reference/original-roadmap.txt、测试、合成评估和 docs/verification.md。没有真实招聘效果或录用率证据。

## Product Principles

- 真实事实优先，建议始终可审阅。
- 一份经历可用于多次投递，保留版本与来源。
- 显示实际运行模式与限制。
- 模板帮助表达，不能替用户编造履历。
