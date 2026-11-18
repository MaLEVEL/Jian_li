# 顶部导航与简历工作区实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 修复模板与标题重叠，顶部导航，并按用户确认让桌面和手机都使用编辑/预览标签。

**Architecture:** 保留 App 状态、存储、业务回调和导出实现。以真实 DOM 结构替换侧栏和三列编辑器；在现有样式文件直接删除或改写冲突规则。

**Tech Stack:** React 18 / TypeScript / CSS / Playwright / Vitest。

**Spec:** 用户本轮反馈与确认；PRODUCT.md 中天蓝、轻盈、有希望的品牌要求。

## Global Constraints
- 保留全部功能、六种模板、真实内容和人工审阅导出门槛。
- 桌面和手机均为编辑/预览标签切换；版本管理不占常驻一列。
- 不读取密钥；不修改无关 8000 端口服务。
- 每约 50 秒报告真实进展，百分比为任务阶段估计。

## Task 1: 重现与回归
**Files:** frontend/e2e/layout.pw.ts, frontend/playwright.config.ts, frontend/package.json
- [x] 使用真实浏览器测量标题输入、保存按钮与模板选择器交集，先运行失败回归。
- [x] 增加 1440/1280/1024/768/390/320 宽度、长标题、六模板、顶部导航和双标签验证。

## Task 2: 结构与控件
**Files:** frontend/src/App.tsx, views.tsx, styles.css, portfolio.css
- [x] 全站顶部导航；手机折叠菜单，当前页与键盘焦点明确。
- [x] 工具栏独立排列版本/版式，管理导入可展开；标题保存独占内容区。
- [x] 两个完整 tab/tabpanel，箭头/Home/End 键支持；导出按钮区明确主次。
- [x] 替换旧侧栏/三列/窄标题规则，统一按钮尺寸和响应式。

## Task 3: 验证与交付
**Files:** docs/verification.md, docs/reviews/2026-11-18-ui-layout-audit.md, .github/workflows/ci.yml
- [x] 浏览器回归、Vitest、构建、独立审查；桌面/手机视觉同批检查。
- [x] 重建现有 18001 Docker 并运行同一浏览器回归。
- [x] 记录红绿证据和旧流程验收遗漏；提交推送并核对远端 SHA。

## 验收结果

- 旧 1440px 碰撞测试先失败；修复后最终 Docker 浏览器 16 passed (39.3s)。
- Vitest 32 passed (1.29s)，后端 89 passed (18.34s)，TypeScript/Vite 与 Docker 构建通过。
- 独立静态审查无未关闭 P1/P2，两项 P3 已关闭。
- 双栏预览拉伸另经失败测试确认后修正，最终 header 90.34px。
