import type {
  JobFrameworkDefinition,
  JobFrameworkId,
  ResumeSectionId,
  ResumeTemplate,
  ResumeTemplateDefinition,
} from "./types";

export const RESUME_TEMPLATE_CATALOG: readonly ResumeTemplateDefinition[] = [
  {
    id: "graduate",
    name: "应届生模板",
    layout: "education-first",
    accent: "#176b53",
    sectionOrder: ["intent", "summary", "education", "skills", "projects", "experience", "awards"],
    description: "教育经历与基础技能靠前，适合校招、实习筛选和毕业求职。",
    version: "1.0.0",
    source: {
      kind: "original",
      creator: "JobFit AI",
      license: "Project built-in asset",
      note: "为应届生求职场景原创设计，只调整视觉层级，不改写事实。",
    },
  },
  {
    id: "internship",
    name: "实习模板",
    layout: "skills-first",
    accent: "#2b6688",
    sectionOrder: ["intent", "summary", "skills", "projects", "education", "experience", "awards"],
    description: "可上手技能和课程项目优先，帮助实习生快速建立匹配感。",
    version: "1.0.0",
    source: {
      kind: "original",
      creator: "JobFit AI",
      license: "Project built-in asset",
      note: "为实习申请场景原创设计，强调技能与项目证明。",
    },
  },
  {
    id: "experienced",
    name: "社招模板",
    layout: "experience-first",
    accent: "#5b4a86",
    sectionOrder: ["intent", "summary", "experience", "projects", "skills", "education", "awards"],
    description: "工作经历和交付成果优先，适合有正式工作经验的求职者。",
    version: "1.0.0",
    source: {
      kind: "original",
      creator: "JobFit AI",
      license: "Project built-in asset",
      note: "为社招筛选场景原创设计，突出职责范围与业务结果。",
    },
  },
  {
    id: "technical",
    name: "技术清晰单栏",
    layout: "single-column",
    accent: "#0d4939",
    sectionOrder: ["intent", "skills", "projects", "experience", "summary", "education", "awards"],
    description: "清晰单栏技术简历，技能、项目和工程经历按扫描顺序排列。",
    version: "1.0.0",
    source: {
      kind: "original",
      creator: "JobFit AI",
      license: "Project built-in asset",
      note: "为工程岗 ATS 可读性原创设计，使用稳定单栏结构。",
    },
  },
  {
    id: "sidebar",
    name: "侧栏双栏模板",
    layout: "two-column-sidebar",
    accent: "#8a4c2f",
    sectionOrder: ["intent", "summary", "skills", "education", "projects", "experience", "awards"],
    description: "侧栏承载技能、教育等短信息，主栏保留项目与经历叙事。",
    version: "1.0.0",
    source: {
      kind: "original",
      creator: "JobFit AI",
      license: "Project built-in asset",
      note: "原创双栏信息架构，用于打印时分区阅读，不压缩关键事实。",
    },
  },
  {
    id: "editorial",
    name: "项目优先编辑风",
    layout: "project-first",
    accent: "#a36b20",
    sectionOrder: ["intent", "summary", "projects", "experience", "skills", "education", "awards"],
    description: "项目优先的编辑式层级，适合作品集型技术或产品岗位。",
    version: "1.0.0",
    source: {
      kind: "original",
      creator: "JobFit AI",
      license: "Project built-in asset",
      note: "原创编辑式版式，以项目叙事代替单纯技能罗列。",
    },
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
