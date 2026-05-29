# JobFit AI Web

一个纯前端的求职简历与投递管理网页版 MVP。当前主项目只运行 `frontend`，后端历史实现已归档到 `archive/backend-legacy`，不再作为默认运行依赖。评审、部署和演示时只需要 `frontend` 目录，`archive` 仅作为历史代码参考，可忽略。

## 功能

- 经历库：维护基本信息、教育经历、技能、项目经历、实习经历、证书奖项。
- 填写引导：经历库字段提供格式说明、占位示例和一键填入模板。
- 从零生成简历：根据经历库生成一份结构化基础简历。
- 粘贴已有简历：把现成简历文本保存为一个简历版本。
- 简历版本库：支持选择、重命名、删除、复制和导出。
- 简历正文编辑：生成或导入后可直接修改总结、技能、项目和经历。
- 内容核对：导出前必须勾选“我已核对”，避免简历出现不真实内容。
- 简历质量检查：检查量化成果、项目结果、空泛表达和一页纸可读性，直接指出哪里需要改。
- 多模板：支持应届生、实习、社招三种 ATS 友好模板。
- 标准 Word 导出：下载 `.docx` 文件，可用 Word/WPS 打开后另存为 PDF。
- PDF 导出：通过浏览器打印窗口保存为 PDF。
- JD 匹配：粘贴公司、岗位和 JD，前端本地估算匹配分、关键词覆盖、技能覆盖、项目覆盖和扣分原因。
- 投递管理：保存投递记录、匹配分、状态、投递日期、渠道、HR 联系方式、跟进时间、面试时间、备注和面试题。
- 数据备份：支持导出本地数据 JSON，也支持从 JSON 备份恢复。

## 技术栈

- React
- TypeScript
- Vite
- lucide-react
- localStorage

## 本地运行

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

默认访问地址：

```text
http://localhost:5173
```

当前纯前端版本不需要 `.env` 或 API Key。

## 构建

```powershell
cd frontend
npm.cmd run build
```

## 测试

```powershell
cd frontend
npm.cmd test
```

## 当前取舍

- 不做登录、多用户、后端数据库。
- 不接真实 AI API，生成和匹配逻辑先用前端模板与关键词分析模拟。
- PDF 使用浏览器打印/另存为 PDF，避免纯前端引入复杂排版服务。
- 数据保存在浏览器 `localStorage`，刷新后会保留；清空本地数据前会弹出确认。
- 本地数据带版本号并做结构校验；如果浏览器禁止写入或容量不足，页面会提示用户导出备份。
- 后端目录已归档到 `archive/backend-legacy`，只作为历史参考。评审/部署时只需要 `frontend` 目录。

## 简历描述

Built a frontend-only job application assistant with React and TypeScript, supporting resume quality checks, ATS-friendly templates, weighted JD keyword matching with score explanations, application tracking, local persistence, DOCX export, and browser-based PDF export.
