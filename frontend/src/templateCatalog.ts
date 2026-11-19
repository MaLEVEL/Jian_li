import type {
  JobFrameworkDefinition,
  JobFrameworkId,
  ResumeAppearance,
  ResumeAudience,
  ResumeFontFamily,
  ResumeSectionId,
  ResumeTemplate,
  ResumeTemplateDefinition,
  ResumeTemplateLayout,
} from "./types";

const SOURCE_OPRESUME = {
  kind: "open-source" as const,
  creator: "OpResume 优派简历",
  license: "MIT",
  url: "https://github.com/oopooa/opresume",
};

const SOURCE_REACTIVE_RESUME = {
  kind: "open-source" as const,
  creator: "Reactive Resume",
  license: "MIT",
  url: "https://github.com/reactive-resume/reactive-resume",
};

const SOURCE_MAGIC_RESUME = {
  kind: "open-source" as const,
  creator: "Magic Resume / Kenmet",
  license: "MIT",
  url: "https://github.com/Magic-Resume/Magic-Resume",
};

const SOURCE_OPEN_RESUME = {
  kind: "open-source" as const,
  creator: "Open Resume",
  license: "MIT",
  url: "https://github.com/AniChikage/open-resume",
};

const SOURCE_DEVCELIO = {
  kind: "open-source" as const,
  creator: "devcelio/resume-template",
  license: "Apache-2.0",
  url: "https://github.com/devcelio/resume-template",
};

const SOURCE_PLUSH_CV = {
  kind: "open-source" as const,
  creator: "PlushCV",
  license: "Apache-2.0",
  url: "https://github.com/cystema/PlushCV",
};

const SOURCE_BRILLIANT_CV = {
  kind: "open-source" as const,
  creator: "Brilliant-CV",
  license: "Apache-2.0",
  url: "https://github.com/yunanwg/brilliant-CV",
};

export const RESUME_AUDIENCE_ORDER: readonly ResumeAudience[] = [
  "campus",
  "internship",
  "professional",
  "technical",
  "product-operations",
  "design-creative",
  "management-consulting",
  "academic-research",
];

export const RESUME_AUDIENCE_LABELS: Record<ResumeAudience, string> = {
  campus: "校招",
  internship: "实习",
  professional: "社招通用",
  technical: "技术研发",
  "product-operations": "产品运营",
  "design-creative": "设计创意",
  "management-consulting": "管理咨询",
  "academic-research": "学术科研",
};

export const RESUME_FONT_OPTIONS: ReadonlyArray<{ value: ResumeFontFamily; label: string; stack: string; wordFont: string }> = [
  {
    value: "sans",
    label: "清晰黑体",
    stack: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", Arial, sans-serif',
    wordFont: "Microsoft YaHei",
  },
  {
    value: "serif",
    label: "宋体书卷",
    stack: '"Noto Serif SC", "Songti SC", SimSun, serif',
    wordFont: "SimSun",
  },
  {
    value: "editorial",
    label: "仿宋编辑",
    stack: 'FangSong, "STFangsong", "Noto Serif SC", serif',
    wordFont: "FangSong",
  },
];

export function getResumeFontOption(fontFamily: ResumeFontFamily) {
  return RESUME_FONT_OPTIONS.find((option) => option.value === fontFamily) ?? RESUME_FONT_OPTIONS[0];
}

export function getResumeAppearanceDefaults(template: Pick<ResumeTemplateDefinition, "accent">): ResumeAppearance {
  return {
    fontFamily: "sans",
    fontSize: 12,
    lineHeight: 1.55,
    pageMargin: 16,
    pageCount: 1,
    accent: template.accent,
  };
}

export function isSidebarResumeLayout(layout: ResumeTemplateLayout) {
  return layout === "product-sidebar" || layout === "portfolio-sidebar";
}

export const RESUME_TEMPLATE_CATALOG: readonly ResumeTemplateDefinition[] = [
  {
    id: "graduate",
    name: "校招成长单栏",
    audience: "campus",
    layout: "campus-growth",
    accent: "#167b9c",
    sectionOrder: ["intent", "summary", "education", "skills", "projects", "experience", "awards"],
    description: "教育背景、基础技能和课程项目顺序清楚，适合第一次完整投递。",
    version: "2.0.0",
    source: { ...SOURCE_OPRESUME, note: "参考中文简历的本地优先与模块化信息层级，在职启云帆中重新实现。" },
  },
  {
    id: "graduate-research",
    name: "校招科研项目",
    audience: "campus",
    layout: "campus-research",
    accent: "#3f7595",
    sectionOrder: ["intent", "education", "projects", "skills", "awards", "summary", "experience"],
    description: "科研、竞赛和课程项目先行，适合研究型校招与技术类管培生。",
    version: "2.0.0",
    source: { ...SOURCE_BRILLIANT_CV, note: "借鉴研究经历优先的层级，并用中文校招内容结构重新设计。" },
  },
  {
    id: "internship",
    name: "实习技能聚焦",
    audience: "internship",
    layout: "internship-skills",
    accent: "#277b9d",
    sectionOrder: ["intent", "skills", "projects", "education", "experience", "summary", "awards"],
    description: "把可上手的工具和项目证据放在前面，适合零经验或首次实习。",
    version: "2.0.0",
    source: { ...SOURCE_OPRESUME, note: "借鉴技能前置的浏览顺序，不引入示例履历或虚构成果。" },
  },
  {
    id: "internship-project",
    name: "实习项目叙事",
    audience: "internship",
    layout: "internship-project",
    accent: "#6485a2",
    sectionOrder: ["intent", "projects", "skills", "experience", "education", "summary", "awards"],
    description: "以课程与个人项目为主线，让实习筛选快速看到动手能力。",
    version: "2.0.0",
    source: { ...SOURCE_MAGIC_RESUME, note: "参考项目优先的编辑体验，版式和数据模型为项目内重新实现。" },
  },
  {
    id: "experienced",
    name: "社招成果导向",
    audience: "professional",
    layout: "professional-impact",
    accent: "#276b7d",
    sectionOrder: ["intent", "experience", "projects", "summary", "skills", "education", "awards"],
    description: "工作经历和业务结果优先，适合有两段以上正式经验的通用社招。",
    version: "2.0.0",
    source: { ...SOURCE_REACTIVE_RESUME, note: "参考成熟简历编辑器的清晰层级与主题系统，结构由本项目实现。" },
  },
  {
    id: "experienced-specialist",
    name: "资深专业纵深",
    audience: "professional",
    layout: "professional-depth",
    accent: "#4d7184",
    sectionOrder: ["intent", "summary", "experience", "skills", "education", "projects", "awards"],
    description: "强调专业能力连续性、复杂项目与领域深度，适合资深个人贡献者。",
    version: "2.0.0",
    source: { ...SOURCE_OPEN_RESUME, note: "借鉴多模板和自托管编辑器的信息密度，未复制上游资产。" },
  },
  {
    id: "technical",
    name: "技术 ATS 单栏",
    audience: "technical",
    layout: "technical-ats",
    accent: "#1b6687",
    sectionOrder: ["intent", "skills", "experience", "projects", "education", "awards", "summary"],
    description: "稳定单栏、清楚标题与纯文本结构，优先保障 ATS 和快速扫描。",
    version: "2.0.0",
    source: { ...SOURCE_DEVCELIO, note: "参考技术简历的信息密度和清晰标题，没有复用 LaTeX 样式代码。" },
  },
  {
    id: "technical-timeline",
    name: "研发时间线",
    audience: "technical",
    layout: "technical-timeline",
    accent: "#376e8d",
    sectionOrder: ["intent", "projects", "skills", "experience", "awards", "education", "summary"],
    description: "项目、技术和经历形成连续时间线，适合研发、算法与平台工程。",
    version: "2.0.0",
    source: { ...SOURCE_MAGIC_RESUME, note: "参考技术项目的连续叙事方式，并适配中文 A4 与 DOCX 输出。" },
  },
  {
    id: "sidebar",
    name: "产品运营双栏",
    audience: "product-operations",
    layout: "product-sidebar",
    accent: "#2f7392",
    sectionOrder: ["intent", "summary", "projects", "skills", "experience", "education", "awards"],
    description: "主栏讲故事、侧栏放技能与教育信息，适合产品和运营岗位。",
    version: "2.0.0",
    source: { ...SOURCE_PLUSH_CV, note: "参考一页双栏的阅读路径，在 React 与 DOCX 中重新实现。" },
  },
  {
    id: "operations-impact",
    name: "运营指标成果",
    audience: "product-operations",
    layout: "operations-metrics",
    accent: "#2d7897",
    sectionOrder: ["intent", "summary", "experience", "projects", "awards", "skills", "education"],
    description: "把增长、转化、留存、活动和协作结果放在最高优先级。",
    version: "2.0.0",
    source: { ...SOURCE_REACTIVE_RESUME, note: "参考主题化数据展示与运营导向版式，不虚构量化结果。" },
  },
  {
    id: "editorial",
    name: "设计作品编辑风",
    audience: "design-creative",
    layout: "design-editorial",
    accent: "#237c99",
    sectionOrder: ["intent", "summary", "projects", "skills", "awards", "experience", "education"],
    description: "大标题、作品先行、留白明确，适合设计、品牌和创意岗位。",
    version: "2.0.0",
    source: { ...SOURCE_MAGIC_RESUME, note: "参考作品优先与编辑化的浏览节奏，重新设计中文排版。" },
  },
  {
    id: "design-portfolio",
    name: "创意作品集侧栏",
    audience: "design-creative",
    layout: "portfolio-sidebar",
    accent: "#467f9b",
    sectionOrder: ["intent", "projects", "skills", "awards", "summary", "experience", "education"],
    description: "侧栏归纳工具与奖项，主栏连续展示作品和个人表达。",
    version: "2.0.0",
    source: { ...SOURCE_OPEN_RESUME, note: "借鉴侧栏工具包与作品叙事组合，未复制模板素材。" },
  },
  {
    id: "management",
    name: "管理摘要单页",
    audience: "management-consulting",
    layout: "management-brief",
    accent: "#376781",
    sectionOrder: ["intent", "summary", "experience", "skills", "awards", "education", "projects"],
    description: "先给管理范围与结果摘要，再展开团队、项目和决策证据。",
    version: "2.0.0",
    source: { ...SOURCE_REACTIVE_RESUME, note: "参考高层摘要与结构化经历版式，只保留用户真实信息。" },
  },
  {
    id: "consulting",
    name: "咨询案例结构",
    audience: "management-consulting",
    layout: "consulting-case",
    accent: "#496c84",
    sectionOrder: ["intent", "summary", "experience", "projects", "skills", "awards", "education"],
    description: "以问题、分析、建议和影响组织经历，适合咨询与战略岗位。",
    version: "2.0.0",
    source: { ...SOURCE_BRILLIANT_CV, note: "参考结构化案例分析表达，适配中文管理与咨询求职。" },
  },
  {
    id: "academic",
    name: "学术研究 CV",
    audience: "academic-research",
    layout: "academic-classic",
    accent: "#2d6986",
    sectionOrder: ["intent", "summary", "education", "projects", "awards", "experience", "skills"],
    description: "教育、研究项目与成果占主导，适合研究生、科研和教职申请。",
    version: "2.0.0",
    source: { ...SOURCE_BRILLIANT_CV, note: "参考学术 CV 的研究成果层级，在中文 A4 和多页输出中重新实现。" },
  },
  {
    id: "academic-compact",
    name: "研究论文紧凑版",
    audience: "academic-research",
    layout: "academic-compact",
    accent: "#547a8d",
    sectionOrder: ["intent", "education", "projects", "awards", "skills", "experience", "summary"],
    description: "提高论文、项目和奖项密度，适合需要两页完整展示的研究者。",
    version: "2.0.0",
    source: { ...SOURCE_PLUSH_CV, note: "借鉴高密度双页排版思路，不复制上游字体或图片。" },
  },
];
export const JOB_FRAMEWORK_CATALOG: readonly JobFrameworkDefinition[] = [
  {
    id: "python-backend",
    name: "Python 后端",
    version: "1.0.0",
    description: "面向 Python 服务端岗位的内容框架：接口、数据、服务质量和线上证据。",
    outline: [
      {
        id: "role-positioning",
        title: "岗位理解与定位",
        placeholders: [
          "请填写你理解的 Python 后端岗位职责，避免照抄 JD 原句。",
          "请选择一个能代表你的后端方向，例如 Web 服务、数据处理或平台工程。",
          "请描述你的经历与该方向的真实关联。",
        ],
        evidenceChecks: [
          "岗位理解是否来自项目、实习或课程中的真实任务？",
          "定位是否避免把框架名等同于工程能力？",
        ],
        preparationQuestions: [
          "为什么这个业务场景需要 Python 服务端方案？",
          "你负责的模块在整个系统中处于什么位置？",
        ],
      },
      {
        id: "backend-skills",
        title: "核心技能证据",
        placeholders: [
          "请列出你能实际使用并证明的 Python 技术栈。",
          "请选择一个 API 或数据模型设计案例进行说明。",
          "请填写你熟悉的测试、日志或问题排查方式。",
        ],
        evidenceChecks: [
          "每项技能是否至少有一个项目、代码或课程证据？",
          "是否区分熟练使用、课程学习和仅了解？",
        ],
        preparationQuestions: [
          "你会如何为一个接口设计请求、响应和错误结构？",
          "服务变慢时你会先查看哪些证据？",
        ],
      },
      {
        id: "service-project",
        title: "服务端项目结构",
        placeholders: [
          "请描述项目目标、你的职责和技术选型原因。",
          "请填写接口、数据表或任务流程中的关键设计。",
          "请说明测试、部署或协作中的具体动作。",
        ],
        evidenceChecks: [
          "项目描述是否说明边界，而不是把团队成果写成个人成果？",
          "设计取舍是否有代码、文档或演示支撑？",
        ],
        preparationQuestions: [
          "这个项目中最重要的技术取舍是什么？",
          "如果并发或数据量增加，哪些设计需要调整？",
        ],
      },
      {
        id: "quality-collaboration",
        title: "工程质量与协作",
        placeholders: [
          "请填写你参与代码评审、测试或文档协作的经历。",
          "请描述一次定位线上或联调问题的过程。",
          "请列出你使用过的工程工具和用途。",
        ],
        evidenceChecks: [
          "协作描述是否有对应仓库、文档或他人反馈？",
          "问题定位过程是否包含假设、证据和验证？",
        ],
        preparationQuestions: [
          "你如何判断一个 bug 是代码、配置还是数据问题？",
          "代码评审时你最关注什么？",
        ],
      },
    ],
  },
  {
    id: "agent-rag",
    name: "Agent / RAG 工程",
    version: "1.0.0",
    description: "面向 Agent、RAG 与 LLM 应用岗位的内容框架：编排、检索、评估和安全边界。",
    outline: [
      {
        id: "agent-positioning",
        title: "Agent 岗位理解",
        placeholders: [
          "请填写你对 Agent 应用边界的理解，明确哪些步骤由模型完成。",
          "请描述一个你实际做过的自动化、检索或对话类项目。",
          "请说明项目中用户如何验证输出。",
        ],
        evidenceChecks: [
          "是否避免把模型调用描述成完全自主决策？",
          "任务拆解和工具调用是否有真实实现或演示？",
        ],
        preparationQuestions: [
          "这个任务为什么需要 Agent，而不是固定脚本？",
          "模型输出失败时系统如何降级？",
        ],
      },
      {
        id: "rag-skills",
        title: "检索与编排证据",
        placeholders: [
          "请列出你实际使用过的编排、向量检索或关键词检索组件。",
          "请描述文档切分、召回、重排或上下文组装的一个细节。",
          "请填写你处理过期、冲突或缺失知识的方法。",
        ],
        evidenceChecks: [
          "RAG 描述是否区分召回、重排和生成阶段？",
          "技术栈是否只在有项目证据时写入简历？",
        ],
        preparationQuestions: [
          "如何判断检索质量是否满足生成要求？",
          "上下文过长时你会如何取舍？",
        ],
      },
      {
        id: "evaluation-safety",
        title: "评估与安全",
        placeholders: [
          "请描述一次输入、输出或检索质量检查的设计。",
          "请填写你处理幻觉、敏感信息或错误引用的方式。",
          "请列出你准备补充的评估指标或人工检查步骤。",
        ],
        evidenceChecks: [
          "评估描述是否包含可复核样例或流程？",
          "安全边界是否说明用户确认和失败提示？",
        ],
        preparationQuestions: [
          "你会如何向评审解释一个答案没有可靠来源？",
          "哪些任务必须限制模型权限？",
        ],
      },
      {
        id: "learning-plan",
        title: "学习与实践计划",
        placeholders: [
          "请选择一个你想补齐的 Agent 工程主题并说明原因。",
          "请描述你准备完成的小型实践项目。",
          "请填写可以用于验收的学习输出。",
        ],
        evidenceChecks: [
          "学习计划是否明确标注为准备方向，而不是已完成经历？",
          "实践项目是否能在无真实公司数据的情况下完成？",
        ],
        preparationQuestions: [
          "这个主题的最低可验证成果是什么？",
          "你如何记录实验过程和失败原因？",
        ],
      },
    ],
  },
  {
    id: "fullstack",
    name: "全栈开发",
    version: "1.0.0",
    description: "面向全栈岗位的内容框架：端到端交付、接口协作、状态管理与部署验证。",
    outline: [
      {
        id: "fullstack-positioning",
        title: "端到端定位",
        placeholders: [
          "请填写你能独立覆盖的前端、接口和数据范围。",
          "请选择一个端到端功能说明从界面到存储的路径。",
          "请描述你在团队协作中的真实边界。",
        ],
        evidenceChecks: [
          "全栈描述是否避免夸大为所有领域精通？",
          "端到端功能是否有代码或演示证据？",
        ],
        preparationQuestions: [
          "这个功能的数据从用户操作到持久化经历了什么？",
          "哪些部分是他人完成，你如何协作？",
        ],
      },
      {
        id: "interface-state",
        title: "界面与状态设计",
        placeholders: [
          "请列出你实际使用的前端框架、组件和状态组织方式。",
          "请描述一个复杂表单、列表或异步状态处理案例。",
          "请填写可访问性、加载和错误状态的处理方式。",
        ],
        evidenceChecks: [
          "状态设计是否对应真实页面或组件？",
          "是否包含空态、失败态和重复提交处理？",
        ],
        preparationQuestions: [
          "为什么这个页面需要这些状态？",
          "如何验证键盘和读屏可用性？",
        ],
      },
      {
        id: "api-data",
        title: "接口与数据协作",
        placeholders: [
          "请填写你设计或联调过的接口类型。",
          "请描述一次前后端字段、时区或错误码对齐经历。",
          "请说明数据校验和持久化中的关键规则。",
        ],
        evidenceChecks: [
          "接口描述是否说明输入、输出和失败行为？",
          "数据规则是否有代码或接口文档证据？",
        ],
        preparationQuestions: [
          "接口失败时用户看到什么？",
          "你会如何设计一个幂等操作？",
        ],
      },
      {
        id: "delivery-quality",
        title: "交付与质量",
        placeholders: [
          "请填写你参与构建、测试或部署的方式。",
          "请描述一次环境差异或回归问题的处理。",
          "请列出你准备展示的部署或演示链接。",
        ],
        evidenceChecks: [
          "部署描述是否区分本地、测试和线上环境？",
          "质量保障是否来自测试、审查或真实反馈？",
        ],
        preparationQuestions: [
          "发布前你会检查哪些关键路径？",
          "如何快速回滚或修复？",
        ],
      },
    ],
  },
  {
    id: "data-analysis",
    name: "数据分析",
    version: "1.0.0",
    description: "面向数据分析岗位的内容框架：业务问题、数据处理、结论表达和决策影响。",
    outline: [
      {
        id: "business-question",
        title: "业务问题定义",
        placeholders: [
          "请填写分析要回答的业务问题。",
          "请描述数据来源、时间范围和对象。",
          "请说明你和需求方如何确认分析口径。",
        ],
        evidenceChecks: [
          "问题定义是否比“做了一份报表”更具体？",
          "分析口径是否有文档、消息或复盘记录？",
        ],
        preparationQuestions: [
          "这个结论会影响什么决策？",
          "哪些字段口径容易误解？",
        ],
      },
      {
        id: "data-process",
        title: "数据处理与验证",
        placeholders: [
          "请列出你实际使用的数据处理工具或语言。",
          "请描述清洗、去重、缺失值或异常值处理步骤。",
          "请填写你做过的数据正确性检查。",
        ],
        evidenceChecks: [
          "处理步骤是否可复现？",
          "异常处理是否有数据样例或检查结果支撑？",
        ],
        preparationQuestions: [
          "如何发现统计口径重复或漏算？",
          "数据更新后结论是否会变化？",
        ],
      },
      {
        id: "insight-communication",
        title: "结论与表达",
        placeholders: [
          "请填写你得到的主要结论及其适用范围。",
          "请描述图表或报告如何服务阅读者决策。",
          "请列出结论中的限制和后续验证需求。",
        ],
        evidenceChecks: [
          "结论是否避免把相关关系说成因果关系？",
          "是否明确没有证据支持的推断？",
        ],
        preparationQuestions: [
          "如果业务方质疑结论，你会展示什么证据？",
          "哪个图表最能支持核心结论？",
        ],
      },
      {
        id: "analysis-practice",
        title: "分析实践准备",
        placeholders: [
          "请选择一个公开数据集或课程项目作为练习主题。",
          "请描述你准备完成的端到端分析流程。",
          "请填写你准备沉淀的报告或演示材料。",
        ],
        evidenceChecks: [
          "练习项目是否明确标注为非公司经历？",
          "最终输出是否包含数据、方法和限制？",
        ],
        preparationQuestions: [
          "这个分析项目最重要的假设是什么？",
          "如何让结果可复现？",
        ],
      },
    ],
  },
  {
    id: "campus-early-career",
    name: "校招与实习",
    version: "1.0.0",
    description: "面向第一次求职：教育、课程项目、实习动作和可迁移能力。",
    outline: [
      {
        id: "campus-positioning",
        title: "求职方向与可迁移能力",
        placeholders: ["请填写目标岗位和愿意工作的城市。", "请列出与岗位相关的课程、社团或项目能力。"],
        evidenceChecks: ["目标岗位是否与真实兴趣和能力一致？", "课程和社团描述是否能落到具体任务？"],
        preparationQuestions: ["为什么选择这个方向？", "你从课程或项目中获得了什么能力？"],
      },
      {
        id: "campus-proof",
        title: "课程与项目证据",
        placeholders: ["请描述一个你完整参与的课程或个人项目。", "请写清你的分工、方法和最终产出。"],
        evidenceChecks: ["项目是否标明课程、个人或团队属性？", "团队项目是否区分个人贡献？"],
        preparationQuestions: ["遇到的最大困难是什么？", "如果重做一次会怎么改？"],
      },
      {
        id: "campus-growth",
        title: "学习与成长",
        placeholders: ["请填写你正在学习且能证明的技能。", "请描述一次接受反馈并改进的经历。"],
        evidenceChecks: ["技能是否有练习记录或作品？", "成长故事是否有真实反馈来源？"],
        preparationQuestions: ["你如何快速学习新知识？", "最近一次主动改进是什么？"],
      },
    ],
  },
  {
    id: "internship-entry",
    name: "实习申请",
    version: "1.0.0",
    description: "面向日常实习和暑期实习：技能可用性、项目证明与到岗条件。",
    outline: [
      {
        id: "internship-fit",
        title: "实习匹配",
        placeholders: ["请填写可实习时间、地点和每周天数。", "请说明岗位职责与已有能力的交集。"],
        evidenceChecks: ["时间与地点是否真实可执行？", "能力交集是否有项目或练习证据？"],
        preparationQuestions: ["为什么现在适合开始实习？", "你能稳定投入多长时间？"],
      },
      {
        id: "internship-work",
        title: "可上手任务",
        placeholders: ["请列出你独立完成过的小任务。", "请描述一次协作、交付或问题修复过程。"],
        evidenceChecks: ["任务是否由本人实际完成？", "成果能否通过作品或记录验证？"],
        preparationQuestions: ["接手陌生任务时如何推进？", "如何确认自己的工作质量？"],
      },
      {
        id: "internship-learning",
        title: "反馈与学习",
        placeholders: ["请准备一个接受指导后改进的例子。", "请说明希望从实习中获得的能力。"],
        evidenceChecks: ["例子是否包含具体反馈和改进行动？", "学习目标是否与岗位相符？"],
        preparationQuestions: ["你如何记录和复盘反馈？", "遇到不确定事项会怎样求助？"],
      },
    ],
  },
  {
    id: "product-operations",
    name: "产品运营",
    version: "1.0.0",
    description: "面向产品、运营与增长岗位：需求判断、方案推进、指标和复盘。",
    outline: [
      {
        id: "product-problem",
        title: "问题与用户",
        placeholders: ["请描述你服务或研究的用户群体。", "请说明你如何发现并确认一个真实需求。"],
        evidenceChecks: ["需求是否有调研、数据或用户反馈来源？", "受众和问题边界是否清楚？"],
        preparationQuestions: ["这个需求为什么值得做？", "你如何区分需求与个人假设？"],
      },
      {
        id: "product-delivery",
        title: "方案与协作",
        placeholders: ["请写清你的方案、角色和协作对象。", "请说明优先级取舍和落地过程。"],
        evidenceChecks: ["方案是否包含明确产出？", "个人贡献是否与团队成果区分？"],
        preparationQuestions: ["如何推动跨团队共识？", "资源有限时如何排优先级？"],
      },
      {
        id: "product-result",
        title: "指标与复盘",
        placeholders: ["请填写你实际使用过的指标和观察周期。", "请描述一次上线后的复盘或迭代。"],
        evidenceChecks: ["指标是否来自真实记录？", "结论是否区分相关性和因果关系？"],
        preparationQuestions: ["指标下降时先排查什么？", "这次项目最值得保留的经验是什么？"],
      },
    ],
  },
  {
    id: "design-creative",
    name: "设计与创意",
    version: "1.0.0",
    description: "面向 UI/UX、品牌与内容岗位：目标、过程、作品和影响。",
    outline: [
      {
        id: "design-context",
        title: "作品背景",
        placeholders: ["请填写作品是课程、个人、比赛还是商业项目。", "请说明用户、目标和使用场景。"],
        evidenceChecks: ["作品属性是否标注真实？", "是否避免把临摹作品写成独立原创？"],
        preparationQuestions: ["这个作品为谁解决了什么？", "哪些约束影响了方案？"],
      },
      {
        id: "design-process",
        title: "过程与取舍",
        placeholders: ["请描述调研、草图、原型或迭代中的一个关键决策。", "请说明你负责的具体部分。"],
        evidenceChecks: ["过程材料是否属于本人？", "团队作品是否明确个人贡献？"],
        preparationQuestions: ["为什么淘汰了另一个方案？", "如何验证设计是否有效？"],
      },
      {
        id: "design-impact",
        title: "结果与表达",
        placeholders: ["请填写用户测试、交付反馈或作品发布结果。", "请准备展示链接、图片或可访问作品。"],
        evidenceChecks: ["结果是否有来源？", "作品链接是否可访问且无隐私风险？"],
        preparationQuestions: ["如何接收设计批评？", "如果继续迭代会优先改什么？"],
      },
    ],
  },
  {
    id: "management-consulting",
    name: "管理与咨询",
    version: "1.0.0",
    description: "面向管理、战略与咨询岗位：范围、结构、决策和影响。",
    outline: [
      {
        id: "management-scope",
        title: "职责与范围",
        placeholders: ["请填写团队规模、预算或业务范围（仅在真实时填写）。", "请说明你直接负责的决策边界。"],
        evidenceChecks: ["数字和范围是否有真实材料支撑？", "个人决策与团队成果是否区分？"],
        preparationQuestions: ["你在组织中的实际影响力是什么？", "最难的利益相关方如何管理？"],
      },
      {
        id: "management-structure",
        title: "问题拆解与推进",
        placeholders: ["请按背景、问题、分析和行动组织一个案例。", "请说明关键假设和验证方式。"],
        evidenceChecks: ["案例结构是否清楚且可追问？", "分析是否避免只给结论没有依据？"],
        preparationQuestions: ["如何发现真正的问题？", "信息不完整时怎样决策？"],
      },
      {
        id: "management-impact",
        title: "影响与复盘",
        placeholders: ["请填写业务、团队或客户实际发生的变化。", "请描述复盘和改进机制。"],
        evidenceChecks: ["影响描述是否区分短期动作和长期结果？", "失败案例是否诚实表达？"],
        preparationQuestions: ["如何衡量管理效果？", "一次失败决策教会了你什么？"],
      },
    ],
  },
  {
    id: "academic-research",
    name: "学术与研究",
    version: "1.0.0",
    description: "面向科研、研究生和教职申请：问题、方法、成果与学术贡献。",
    outline: [
      {
        id: "research-question",
        title: "研究问题",
        placeholders: ["请描述研究领域、问题和学术价值。", "请列出你实际参与的课题或论文。"],
        evidenceChecks: ["课题归属和作者顺序是否真实？", "研究问题是否避免夸大创新性？"],
        preparationQuestions: ["研究问题从何而来？", "现有研究的不足是什么？"],
      },
      {
        id: "research-method",
        title: "方法与证据",
        placeholders: ["请说明你使用的方法、数据和实验设置。", "请写清你负责的实验、分析或写作部分。"],
        evidenceChecks: ["方法是否可复现？", "数据和代码是否有合规来源？"],
        preparationQuestions: ["研究有哪些限制？", "如何排除替代解释？"],
      },
      {
        id: "research-output",
        title: "成果与交流",
        placeholders: ["请列出论文、报告、专利、海报或会议交流。", "请标注状态，例如已发表、在投或在研。"],
        evidenceChecks: ["成果状态和署名是否准确？", "未发表内容是否遵守保密要求？"],
        preparationQuestions: ["你的核心贡献是什么？", "如何向非专业听众解释研究？"],
      },
    ],
  },
];

export const RESUME_ACCENT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "#167b9c", label: "晴空蓝" },
  { value: "#3f7595", label: "远山蓝" },
  { value: "#277b9d", label: "海盐蓝" },
  { value: "#6485a2", label: "雾面蓝" },
  { value: "#276b7d", label: "松石青" },
  { value: "#4d7184", label: "专业蓝" },
  { value: "#1b6687", label: "工程蓝" },
  { value: "#376e8d", label: "时间线蓝" },
  { value: "#2f7392", label: "产品蓝" },
  { value: "#2d7897", label: "指标蓝" },
  { value: "#237c99", label: "创意青" },
  { value: "#467f9b", label: "作品蓝" },
  { value: "#376781", label: "管理蓝" },
  { value: "#496c84", label: "咨询蓝" },
  { value: "#2d6986", label: "学术蓝" },
  { value: "#547a8d", label: "论文蓝" },
  { value: "#a36b20", label: "暖砂金" },
  { value: "#5b4a86", label: "暮色紫" },
  { value: "#245f82", label: "深海蓝" },
];
export function isResumeTemplate(value: string): value is ResumeTemplate {
  return RESUME_TEMPLATE_CATALOG.some((template) => template.id === value);
}

export function getResumeTemplateDefinition(id: ResumeTemplate): ResumeTemplateDefinition {
  const template = RESUME_TEMPLATE_CATALOG.find((item) => item.id === id);
  if (!template) {
    throw new Error(`Unknown resume template: ${id}`);
  }
  return template;
}

export function getJobFramework(id: JobFrameworkId): JobFrameworkDefinition {
  const framework = JOB_FRAMEWORK_CATALOG.find((item) => item.id === id);
  if (!framework) {
    throw new Error(`Unknown job framework: ${id}`);
  }
  return framework;
}

export function buildFrameworkOutlineMarkdown(framework: JobFrameworkDefinition): string {
  const lines = [
    `# 岗位内容框架：${framework.name}`,
    "",
    `版本：${framework.version}`,
    "",
    "> 该框架只整理结构和证据，不虚构履历，也不会自动覆盖个人资料。",
    "",
  ];

  framework.outline.forEach((section) => {
    lines.push(`## ${section.title}`, "", "### 待补充");
    section.placeholders.forEach((placeholder) => lines.push(`- ${placeholder}`));
    lines.push("", "### 证据检查");
    section.evidenceChecks.forEach((check) => lines.push(`- ${check}`));
    lines.push("", "### 准备问题");
    section.preparationQuestions.forEach((question) => lines.push(`- ${question}`));
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

export function getResumeSectionOrder(id: ResumeTemplate): readonly ResumeSectionId[] {
  return getResumeTemplateDefinition(id).sectionOrder;
}
