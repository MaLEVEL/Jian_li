import type { ApplicationStatus, CandidateProfile, JobDraft } from "./types";
import { RESUME_TEMPLATE_CATALOG } from "./templateCatalog";

export const STATUS_OPTIONS: Array<{ value: ApplicationStatus; label: string }> = [
  { value: "saved", label: "收藏" },
  { value: "applied", label: "已投递" },
  { value: "screening", label: "筛选中" },
  { value: "interviewing", label: "面试中" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "未通过" },
];

export const EMPTY_JOB: JobDraft = {
  company: "",
  title: "",
  description: "",
};

export const SAMPLE_FRONTEND_JOB: JobDraft = {
  company: "星河科技",
  title: "前端开发实习生",
  description:
    "岗位职责：\n" +
    "1. 参与 Web 端业务页面开发，使用 React、TypeScript 和 Vite 完成组件化页面搭建。\n" +
    "2. 配合产品和设计同学优化用户体验，关注表单、列表、数据看板等核心流程。\n" +
    "3. 参与前端工程化建设，包括组件复用、代码规范、性能优化和基础测试。\n" +
    "4. 与后端同学协作完成 API 联调，推动功能上线和问题修复。\n\n" +
    "任职要求：\n" +
    "1. 熟悉 HTML、CSS、JavaScript，了解 React 和 TypeScript 基础用法。\n" +
    "2. 有至少一个完整前端项目或课程项目，能说明自己的职责、技术选择和结果。\n" +
    "3. 了解 Git、接口联调、浏览器调试和基础性能优化。\n" +
    "4. 加分项：有 Vite、组件库、用户体验优化、数据可视化或 AI 工具类项目经验。",
};

export const RESUME_TEMPLATE_OPTIONS = RESUME_TEMPLATE_CATALOG.map((template) => ({
  value: template.id,
  label: template.name,
  description: template.description,
}));

export const DEFAULT_PROFILE: CandidateProfile = {
  name: "张同学",
  email: "zhang@example.com",
  phone: "138-0000-0000",
  location: "上海",
  targetRole: "前端开发工程师",
  headline: "计算机相关专业应届生，关注 React、TypeScript 与 AI 工具产品。",
  education: "某某大学｜软件工程｜本科｜2022.09 - 2026.06｜GPA 3.6/4.0",
  skills: "React, TypeScript, JavaScript, HTML, CSS, Vite, Python, FastAPI, SQLite, Git",
  projects:
    "JobFit AI 求职助手：使用 React 和 TypeScript 实现简历生成、JD 匹配、投递管理的前端原型，支持本地存储和关键词匹配。\n校园二手交易平台：负责商品发布、搜索筛选、订单状态页面，使用组件化方式提升复用性。",
  experience:
    "前端开发实习生｜某科技公司｜2025.07 - 2025.10｜参与后台管理系统页面开发，封装表单和表格组件，配合后端联调接口。",
  awards: "校级优秀课程设计｜英语四级｜GitHub 项目作品集",
};

export const KEYWORD_BANK = [
  "React",
  "Vue",
  "TypeScript",
  "JavaScript",
  "Python",
  "FastAPI",
  "Node",
  "SQL",
  "SQLite",
  "PostgreSQL",
  "API",
  "Git",
  "Vite",
  "HTML",
  "CSS",
  "Tailwind",
  "测试",
  "性能",
  "组件",
  "前端",
  "后端",
  "数据",
  "AI",
  "LLM",
  "用户体验",
  "UX",
  "UI",
  "组件化",
  "工程化",
  "协作",
  "项目",
  "实习",
];
