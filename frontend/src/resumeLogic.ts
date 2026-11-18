import type { Document as DocxDocument, Paragraph as DocxParagraph, Table as DocxTable } from "docx";
import { KEYWORD_BANK } from "./constants";
import { getResumeSectionOrder, getResumeTemplateDefinition } from "./templateCatalog";
import type {
  CandidateProfile,
  InterviewQuestions,
  JobDraft,
  MatchReport,
  QualityIssue,
  ResumeQualityReport,
  ResumeIdentity,
  ResumeSections,
  ResumeSectionId,
  ResumeVersion,
} from "./types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "for",
  "from",
  "have",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "the",
  "this",
  "to",
  "we",
  "will",
  "with",
  "you",
  "your",
  "need",
  "needs",
  "looking",
  "role",
  "candidate",
  "engineer",
  "developer",
  "development",
  "experience",
  "responsibilities",
  "requirements",
]);

const BANK_KEYWORDS = new Map(KEYWORD_BANK.map((keyword) => [keyword.toLowerCase(), keyword]));
const RESULT_PATTERN = /提升|降低|减少|增加|完成|实现|上线|交付|优化|转化|留存|性能|效率|用户|营收|准确率|built|improved|reduced|increased|launched|delivered|optimized|shipped|saved/i;
const VAGUE_PATTERN = /熟悉|了解|参与|负责相关|若干|一些|良好|较强|various|some|responsible for|familiar with|helped/i;
const NUMBER_PATTERN = /\d+(?:\.\d+)?%?|\d+\s*(?:人|次|万|k|K|ms|s|小时|天|周|月)/;
const RESPONSIBILITY_PATTERN = /负责|参与|设计|开发|实现|优化|分析|调研|协作|推进|维护|测试|上线|交付|build|built|design|develop|implement|optimize|analyze|research|collaborate|maintain|test|ship|deliver/i;

function normalizeKeyword(value: string) {
  return value.trim().replace(/^[^A-Za-z0-9+#]+|[^A-Za-z0-9+#]+$/g, "").toLowerCase();
}

function profileToIdentity(profile: CandidateProfile): ResumeIdentity {
  return {
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
  };
}

export function getResumeIdentity(profile: CandidateProfile, resume: ResumeVersion): ResumeIdentity {
  return resume.identity ?? profileToIdentity(profile);
}

export function buildResumeRenderProfile(profile: CandidateProfile, resume: ResumeVersion): CandidateProfile {
  return {
    ...profile,
    ...getResumeIdentity(profile, resume),
    targetRole: resume.targetRole,
  };
}

function formatContact(identity: ResumeIdentity) {
  return [identity.phone, identity.email, identity.location].filter(Boolean).join(" | ");
}

export function createId(prefix: string) {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${id}`;
}

export function splitLines(value: string) {
  return value
    .split(/\n|；|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function splitSkills(value: string) {
  return value
    .split(/,|，|\n|\/|、/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function extractKeywordScores(text: string) {
  const normalized = text.toLowerCase();
  const scores = new Map<string, { keyword: string; score: number; firstIndex: number }>();

  const addKeyword = (keyword: string, score: number, firstIndex: number) => {
    const key = normalizeKeyword(keyword);
    if (!key || STOP_WORDS.has(key)) {
      return;
    }
    const existing = scores.get(key);
    if (existing) {
      existing.score += score;
      existing.firstIndex = Math.min(existing.firstIndex, firstIndex);
      return;
    }
    scores.set(key, { keyword, score, firstIndex });
  };

  KEYWORD_BANK.forEach((keyword) => {
    const key = keyword.toLowerCase();
    const firstIndex = normalized.indexOf(key);
    if (firstIndex >= 0) {
      const frequency = normalized.split(key).length - 1;
      addKeyword(keyword, 8 + Math.min(frequency, 3), firstIndex);
    }
  });

  Array.from(text.matchAll(/[A-Za-z][A-Za-z0-9+#.-]{1,}/g)).forEach((match) => {
    const raw = match[0];
    const key = normalizeKeyword(raw);
    if (!key || STOP_WORDS.has(key) || key.length < 2 || /^[\d.-]+$/.test(key)) {
      return;
    }
    const canonical = BANK_KEYWORDS.get(key) ?? raw;
    const baseScore = BANK_KEYWORDS.has(key) ? 7 : key.length >= 8 ? 3 : 2;
    addKeyword(canonical, baseScore, match.index ?? text.length);
  });

  return Array.from(scores.values())
    .sort((left, right) => right.score - left.score || left.firstIndex - right.firstIndex)
    .slice(0, 28);
}

export function extractKeywords(text: string) {
  return extractKeywordScores(text).map((item) => item.keyword);
}

export function renderResumeText(profile: CandidateProfile, sections: ResumeSections) {
  const lines = [
    profile.name,
    `${profile.phone} | ${profile.email} | ${profile.location}`,
    "",
    "求职意向",
    profile.targetRole,
    "",
    "个人总结",
    sections.summary,
    "",
    "技能",
    sections.skills.join(" / "),
    "",
    "教育经历",
    ...sections.education,
    "",
    "项目经历",
    ...sections.projects.map((item) => `- ${item}`),
    "",
    "实习/工作经历",
    ...sections.experience.map((item) => `- ${item}`),
    "",
    "证书/奖项",
    ...sections.awards.map((item) => `- ${item}`),
  ];
  return lines.filter((line, index) => line || lines[index - 1] !== "").join("\n");
}

export function extractResumeIdentityFromText(text: string): ResumeIdentity {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstBlock = lines.slice(0, 8).join("\n");
  const email = firstBlock.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  const phone = firstBlock.match(/(?:\+?86[-\s]?)?(?:1[3-9]\d{9}|\d{3,4}[-\s]?\d{7,8})/)?.[0] ?? "";
  const location =
    firstBlock.match(/(?:北京|上海|广州|深圳|杭州|南京|成都|武汉|西安|苏州|天津|重庆|厦门|长沙|郑州|青岛|合肥|宁波|无锡|大连|沈阳)/)?.[0] ??
    "";
  const name =
    lines.find((line) => {
      if (line.includes("@") || /\d{5,}/.test(line) || /[:：|]/.test(line)) {
        return false;
      }
      if (/教育|技能|项目|实习|工作|经历|求职|电话|邮箱|email|phone|skills|education|experience|project/i.test(line)) {
        return false;
      }
      return line.length >= 2 && line.length <= 18;
    }) ?? "";

  return { name, email, phone, location };
}

export function extractResumeTargetRoleFromText(text: string) {
  const identity = extractResumeIdentityFromText(text);
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .find((line) => {
        if (line === identity.name || line.includes("@") || /\d{5,}/.test(line) || /[:：|]/.test(line)) {
          return false;
        }
        if (/教育|技能|项目|经历|电话|邮箱|email|phone|skills|education|experience|project/i.test(line)) {
          return false;
        }
        return /岗位|工程师|开发|产品|运营|设计|数据|助理|实习生|经理|专员|analyst|assistant|intern|manager|designer/i.test(line);
      }) ?? ""
  );
}

export function getOrderedResumeSections(resume: ResumeVersion) {
  const sections: Record<ResumeSectionId, { title: string; items: string[] }> = {
    intent: { title: "求职意向", items: [resume.targetRole] },
    summary: { title: "个人总结", items: [resume.sections.summary] },
    skills: { title: "技能", items: [resume.sections.skills.join(" / ")] },
    education: { title: "教育经历", items: resume.sections.education },
    projects: { title: "项目经历", items: resume.sections.projects },
    experience: { title: "实习/工作经历", items: resume.sections.experience },
    awards: { title: "证书/奖项", items: resume.sections.awards },
  };

  const order = getResumeSectionOrder(resume.template);
  return order.map((key) => ({ id: key, ...sections[key] }));
}

export function inspectResumeQuality(resume: ResumeVersion): ResumeQualityReport {
  const issues: QualityIssue[] = [];
  const projectAndExperience = [...resume.sections.projects, ...resume.sections.experience];
  const contentUnits = resume.plainText.replace(/\s/g, "").length + projectAndExperience.length * 36;
  const estimatedPages = Math.max(1, Math.ceil(contentUnits / 1150));
  const quantifiedLines = projectAndExperience.filter((item) => NUMBER_PATTERN.test(item));
  const resultLines = projectAndExperience.filter((item) => RESULT_PATTERN.test(item));
  const vagueLines = projectAndExperience.filter((item) => VAGUE_PATTERN.test(item));

  if (quantifiedLines.length) {
    issues.push({
      id: "quantified-results",
      level: "good",
      title: "已有量化成果",
      detail: `${quantifiedLines.length} 条项目/经历包含数字或比例，可信度较好。`,
    });
  } else {
    issues.push({
      id: "quantified-results",
      level: "bad",
      title: "缺少量化成果",
      detail: "项目或实习经历里没有明显数字，建议补充用户量、性能提升、完成周期或覆盖范围。",
    });
  }

  if (resultLines.length) {
    issues.push({
      id: "project-results",
      level: "good",
      title: "有结果表达",
      detail: `${resultLines.length} 条经历写到了交付、优化或结果。`,
    });
  } else {
    issues.push({
      id: "project-results",
      level: "warn",
      title: "项目结果不够明确",
      detail: "建议每个重点项目补一句结果，比如上线、提效、稳定性、用户反馈或业务影响。",
    });
  }

  if (vagueLines.length) {
    issues.push({
      id: "vague-wording",
      level: "warn",
      title: "存在偏空泛表述",
      detail: `发现 ${vagueLines.length} 条可能偏空泛的经历，建议把“参与/负责/熟悉”改成具体动作和产出。`,
    });
  } else {
    issues.push({
      id: "vague-wording",
      level: "good",
      title: "表述较具体",
      detail: "没有明显大量空泛词，继续保持动作和结果导向。",
    });
  }

  if (estimatedPages > 1) {
    issues.push({
      id: "one-page",
      level: "warn",
      title: "可能超过一页",
      detail: `当前内容估算约 ${estimatedPages} 页，建议压缩低相关经历，优先保留和目标岗位最相关的项目。`,
    });
  } else {
    issues.push({
      id: "one-page",
      level: "good",
      title: "一页纸可读",
      detail: "当前内容量适合一页纸简历，导出前再检查排版密度。",
    });
  }

  if (resume.sections.projects.length < 2 && resume.template !== "experienced") {
    issues.push({
      id: "project-depth",
      level: "warn",
      title: "项目支撑略少",
      detail: "建议至少保留 2 个能体现技能栈和独立贡献的项目。",
    });
  }

  const deduction = issues.reduce((total, issue) => total + (issue.level === "bad" ? 22 : issue.level === "warn" ? 10 : 0), 0);
  return {
    score: Math.max(45, 100 - deduction),
    estimatedPages,
    contentUnits,
    issues,
  };
}

export function buildResumeFromProfile(profile: CandidateProfile): ResumeSections {
  return {
    summary:
      profile.headline ||
      `面向${profile.targetRole}岗位，具备项目实践、工程协作和持续学习能力。`,
    skills: splitSkills(profile.skills),
    education: splitLines(profile.education),
    projects: splitLines(profile.projects),
    experience: splitLines(profile.experience),
    awards: splitLines(profile.awards),
  };
}

export function buildResumeFromPastedText(text: string): ResumeSections {
  const lines = splitLines(text)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  type ParsedSection = "summary" | "skills" | "education" | "projects" | "experience" | "awards" | undefined;
  const identity = extractResumeIdentityFromText(text);
  const targetRole = extractResumeTargetRoleFromText(text);
  const sections: ResumeSections = {
    summary: "",
    skills: [],
    education: [],
    projects: [],
    experience: [],
    awards: [],
  };
  let currentSection: ParsedSection;

  const cleanSectionValue = (line: string, pattern: RegExp) => line.replace(pattern, "").replace(/^[:：]\s*/, "").trim();
  const isHeaderLine = (line: string) =>
    line === identity.name ||
    line === targetRole ||
    line === identity.email ||
    line === identity.phone ||
    line === identity.location ||
    /^(姓名|电话|手机|邮箱|城市|地址|求职意向|目标岗位)[:：]/.test(line) ||
    /email|phone|tel|github|linkedin|@/i.test(line);
  const appendLine = (section: Exclude<ParsedSection, undefined>, value: string) => {
    const cleaned = value.replace(/^[-*•]\s*/, "").trim();
    if (!cleaned || isHeaderLine(cleaned)) {
      return;
    }
    if (section === "summary") {
      sections.summary = sections.summary ? `${sections.summary}\n${cleaned}` : cleaned;
      return;
    }
    if (section === "skills") {
      sections.skills.push(...splitSkills(cleaned));
      return;
    }
    sections[section].push(cleaned);
  };

  lines.forEach((line) => {
    if (isHeaderLine(line)) {
      return;
    }
    const sectionMatch =
      line.match(/^(个人总结|自我评价|个人简介|summary|profile)[:：]?\s*/i) ??
      line.match(/^(技能|技能关键词|专业技能|技术栈|skills|technical skills|tech stack)[:：]?\s*/i) ??
      line.match(/^(教育经历|教育背景|教育|education)[:：]?\s*/i) ??
      line.match(/^(项目经历|项目经验|项目|projects?)[:：]?\s*/i) ??
      line.match(/^(实习经历|工作经历|工作经验|实习\/工作经历|experience|work experience|internship)[:：]?\s*/i) ??
      line.match(/^(证书\/奖项|证书|奖项|荣誉|awards?|certificates?|honors?)[:：]?\s*/i);

    if (sectionMatch) {
      const matchedTitle = sectionMatch[1].toLowerCase();
      if (/个人|自我|summary|profile/.test(matchedTitle)) {
        currentSection = "summary";
      } else if (/技能|skills|tech/.test(matchedTitle)) {
        currentSection = "skills";
      } else if (/教育|education/.test(matchedTitle)) {
        currentSection = "education";
      } else if (/项目|project/.test(matchedTitle)) {
        currentSection = "projects";
      } else if (/实习|工作|experience|internship/.test(matchedTitle)) {
        currentSection = "experience";
      } else {
        currentSection = "awards";
      }
      const value = cleanSectionValue(line, sectionMatch[0] ? new RegExp(`^${sectionMatch[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) : /^/);
      if (value) {
        appendLine(currentSection, value);
      }
      return;
    }

    if (currentSection) {
      appendLine(currentSection, line);
    }
  });

  if (!sections.education.length) {
    sections.education = lines
      .filter((line) => !isHeaderLine(line) && /大学|学院|本科|硕士|专业|GPA|university|college|bachelor|master|degree/i.test(line))
      .slice(0, 4);
  }
  if (!sections.projects.length) {
    sections.projects = lines
      .filter((line) => !isHeaderLine(line) && /项目|系统|平台|应用|App|AI|React|Python|project|system|platform|application/i.test(line))
      .slice(0, 8);
  }
  if (!sections.experience.length) {
    sections.experience = lines
      .filter((line) => !isHeaderLine(line) && /实习|工作|公司|负责|开发|优化|experience|intern|company|worked|built/i.test(line))
      .slice(0, 8);
  }
  if (!sections.awards.length) {
    sections.awards = lines
      .filter((line) => !isHeaderLine(line) && /奖|证书|英语|竞赛|优秀|CET|certificate|award|honor|competition/i.test(line))
      .slice(0, 4);
  }

  const skills = Array.from(new Set(sections.skills.length ? sections.skills : extractKeywords(text))).slice(0, 18);
  const summary = sections.summary || "已导入一份已有简历文本，可继续用于 JD 匹配和版本管理。";

  return {
    summary,
    skills,
    education: Array.from(new Set(sections.education)).slice(0, 4),
    projects: Array.from(new Set(sections.projects)).slice(0, 8),
    experience: Array.from(new Set(sections.experience)).slice(0, 8),
    awards: Array.from(new Set(sections.awards)).slice(0, 4),
  };
}

export function findUnsupportedClaims(profile: CandidateProfile, resumeText: string) {
  const sourceText = Object.values(profile).join("\n");
  const claims = Array.from(resumeText.matchAll(/\b\d+(?:\.\d+)?%?|\b20\d{2}\b|\b19\d{2}\b/g)).map(
    (match) => match[0],
  );
  return Array.from(new Set(claims.filter((claim) => !sourceText.includes(claim))));
}

function calculateSectionCoverage(sectionText: string, jobKeywordScores: Array<{ keyword: string; score: number }>) {
  const sectionKeys = new Set(extractKeywordScores(sectionText).map((item) => normalizeKeyword(item.keyword)));
  const totalWeight = jobKeywordScores.reduce((total, item) => total + item.score, 0);
  const coveredWeight = jobKeywordScores
    .filter((item) => sectionKeys.has(normalizeKeyword(item.keyword)))
    .reduce((total, item) => total + item.score, 0);
  return totalWeight ? coveredWeight / totalWeight : 0;
}

function calculateQuantificationScore(sections?: ResumeSections) {
  if (!sections) {
    return 0;
  }
  const proofLines = [...sections.projects, ...sections.experience];
  if (!proofLines.length) {
    return 0;
  }
  const quantifiedRatio = proofLines.filter((line) => NUMBER_PATTERN.test(line)).length / proofLines.length;
  const measuredResultRatio =
    proofLines.filter((line) => NUMBER_PATTERN.test(line) && RESULT_PATTERN.test(line)).length / proofLines.length;
  return Math.min(1, quantifiedRatio * 0.85 + measuredResultRatio * 0.15);
}

function calculateResponsibilityCoverage(jobDescription: string, sections?: ResumeSections) {
  if (!sections) {
    return 0;
  }
  const jobResponsibilities = jobDescription
    .split(/\n|。|；|;|\./)
    .map((line) => line.trim())
    .filter((line) => RESPONSIBILITY_PATTERN.test(line));
  if (!jobResponsibilities.length) {
    return 0.5;
  }
  const proofText = [...sections.projects, ...sections.experience].join("\n").toLowerCase();
  const matchedCount = jobResponsibilities.filter((line) =>
    extractKeywords(line).some((keyword) => proofText.includes(keyword.toLowerCase())),
  ).length;
  return matchedCount / jobResponsibilities.length;
}

function calculateCompactQualityScore(sections?: ResumeSections) {
  if (!sections) {
    return 0.55;
  }
  const proofLines = [...sections.projects, ...sections.experience];
  if (!proofLines.length) {
    return 0.25;
  }
  let score = 0.68;
  const vagueRatio = proofLines.filter((line) => VAGUE_PATTERN.test(line)).length / proofLines.length;
  const concreteResultRatio =
    proofLines.filter((line) => RESULT_PATTERN.test(line) && NUMBER_PATTERN.test(line)).length / proofLines.length;
  if (sections.summary.trim().length >= 18) {
    score += 0.08;
  }
  if (sections.projects.length >= 2) {
    score += 0.08;
  }
  if (sections.skills.length >= 4) {
    score += 0.06;
  }
  score += concreteResultRatio * 0.12;
  score -= vagueRatio * 0.22;
  return Math.max(0, Math.min(1, score));
}

export function analyzeMatch(resumeText: string, jobDescription: string, sections?: ResumeSections): MatchReport {
  const resumeKeywordScores = extractKeywordScores(resumeText);
  const jobKeywordScores = extractKeywordScores(jobDescription);
  const resumeKeywordKeys = new Set(resumeKeywordScores.map((item) => normalizeKeyword(item.keyword)));
  const matchedKeywordScores = jobKeywordScores.filter((item) => resumeKeywordKeys.has(normalizeKeyword(item.keyword)));
  const missingKeywordScores = jobKeywordScores.filter((item) => !resumeKeywordKeys.has(normalizeKeyword(item.keyword)));
  const totalWeight = jobKeywordScores.reduce((total, item) => total + item.score, 0);
  const matchedWeight = matchedKeywordScores.reduce((total, item) => total + item.score, 0);
  const weightedCoverage = totalWeight ? matchedWeight / totalWeight : 0;
  const skillCoverage = calculateSectionCoverage(sections?.skills.join(" ") ?? resumeText, jobKeywordScores);
  const projectCoverage = calculateSectionCoverage(
    [...(sections?.projects ?? []), ...(sections?.experience ?? [])].join("\n") || resumeText,
    jobKeywordScores,
  );
  const quantificationScore = calculateQuantificationScore(sections);
  const responsibilityCoverage = calculateResponsibilityCoverage(jobDescription, sections);
  const qualityScore = calculateCompactQualityScore(sections);
  const matchedKeywords = matchedKeywordScores.map((item) => item.keyword);
  const missingKeywords = missingKeywordScores.map((item) => item.keyword);
  const score = totalWeight
    ? Math.min(
        96,
        Math.max(
          28,
          Math.round(
            skillCoverage * 30 +
              projectCoverage * 30 +
              quantificationScore * 20 +
              responsibilityCoverage * 10 +
              qualityScore * 10,
          ),
        ),
      )
    : 58;

  return {
    score,
    weightedCoverage: Math.round(weightedCoverage * 100),
    skillCoverage: Math.round(skillCoverage * 100),
    projectCoverage: Math.round(projectCoverage * 100),
    matchedKeywords,
    missingKeywords,
    scoreBreakdown: [
      `技能关键词贡献 ${Math.round(skillCoverage * 30)}/30：看技能区是否直接命中 JD 的核心技术词。`,
      `项目经历证明贡献 ${Math.round(projectCoverage * 30)}/30：看项目和实习经历是否能证明这些关键词。`,
      `量化成果贡献 ${Math.round(quantificationScore * 20)}/20：看项目/经历里是否有数字、比例或规模。`,
      `岗位职责覆盖贡献 ${Math.round(responsibilityCoverage * 10)}/10：看项目/经历是否覆盖 JD 中的主要动作。`,
      `简历质量贡献 ${Math.round(qualityScore * 10)}/10：看总结、项目数量、表达具体度和空泛词。`,
      missingKeywords.length
        ? `主要扣分来自缺口：${missingKeywords.slice(0, 6).join("、")}。`
        : "关键词缺口较少，分数仍会受项目证明和量化成果约束。",
    ],
    strengths: [
      matchedKeywords.length
        ? `简历已经覆盖 ${matchedKeywords.slice(0, 6).join("、")} 等高权重岗位关键词。`
        : "简历已有完整经历结构，可继续补充岗位关键词。",
      "项目、技能、教育信息已经可以支撑一份基础投递简历。",
    ],
    gaps: [
      missingKeywords.length
        ? `JD 中权重较高但暂未明显体现：${missingKeywords.slice(0, 8).join("、")}。`
        : "当前 JD 关键词覆盖较好，下一步可加强成果量化。",
    ],
    suggestions: [
      `当前加权关键词覆盖率约为 ${Math.round(weightedCoverage * 100)}%，但最终分数会被项目证明、量化成果和简历质量共同约束。`,
      "把最匹配岗位的项目放到简历前半部分，降低 HR 扫读成本。",
      "每条项目经历尽量写清楚动作、技术、结果，避免只罗列工具名。",
    ],
    optimizedBullets: missingKeywords.slice(0, 4).map((keyword) => `可在真实经历中补充与“${keyword}”相关的职责或成果。`),
  };
}

export function buildQuestions(report: MatchReport, job: JobDraft): InterviewQuestions {
  const focus = report.matchedKeywords[0] || report.missingKeywords[0] || job.title || "目标岗位";
  return {
    technical: [
      `请讲一个你在 ${focus} 相关项目中遇到的技术难点。`,
      "如果要提升一个页面或接口的稳定性，你会先看哪些指标？",
      "你如何判断一个前端组件是否值得抽象复用？",
    ],
    project: [
      "请选择一个最能代表你能力的项目，按背景、职责、方案、结果说明。",
      "项目需求变化时，你如何评估影响并推进交付？",
      "你在项目中做过哪些复盘，后来具体改进了什么？",
    ],
    behavioral: [
      "请描述一次你主动发现问题并推动解决的经历。",
      "当任务优先级冲突时，你如何沟通取舍？",
      `你为什么想投递 ${job.company || "这家公司"} 的 ${job.title || "这个岗位"}？`,
    ],
  };
}

export function optimizeResume(profile: CandidateProfile, resume: ResumeVersion, job: JobDraft, report: MatchReport) {
  const jobKeywords = report.matchedKeywords.concat(report.missingKeywords);
  const topMatched = report.matchedKeywords.slice(0, 4);
  const topMissing = report.missingKeywords.slice(0, 3);
  const scoreLine = (text: string) =>
    jobKeywords.reduce((score, keyword) => score + (text.toLowerCase().includes(keyword.toLowerCase()) ? 1 : 0), 0);
  const tagLine = (text: string) => {
    const tags = jobKeywords
      .filter((keyword) => text.toLowerCase().includes(keyword.toLowerCase()))
      .slice(0, 3);
    return tags.length && !text.includes("匹配关键词：") ? `${text}（匹配关键词：${tags.join("、")}）` : text;
  };
  const sortedSkills = [...resume.sections.skills].sort((left, right) => {
    const leftHit = jobKeywords.some((keyword) => keyword.toLowerCase() === left.toLowerCase()) ? 1 : 0;
    const rightHit = jobKeywords.some((keyword) => keyword.toLowerCase() === right.toLowerCase()) ? 1 : 0;
    return rightHit - leftHit;
  });
  const sortedProjects = [...resume.sections.projects]
    .sort((left, right) => scoreLine(right) - scoreLine(left))
    .map(tagLine);
  const sortedExperience = [...resume.sections.experience]
    .sort((left, right) => scoreLine(right) - scoreLine(left))
    .map(tagLine);
  const highlight = `岗位相关亮点：围绕 ${job.title || profile.targetRole} 岗位，优先展示 ${
    topMatched.join("、") || "项目交付、工程协作和学习能力"
  }；${
    topMissing.length ? `后续可在真实经历中补充 ${topMissing.join("、")}。` : "当前关键词覆盖较完整，可继续补充可量化成果。"
  }`;

  return {
    ...resume.sections,
    summary: `面向${job.title || profile.targetRole}岗位，基于已有经历突出${
      topMatched.join("、") || "项目实践、工程协作和学习能力"
    }。${topMissing.length ? `同时提醒：JD 中的 ${topMissing.join("、")} 需要用户确认是否有真实经历可补充。` : ""}`,
    skills: sortedSkills,
    projects: [highlight, ...sortedProjects],
    experience: sortedExperience,
  };
}

export async function buildResumeDocument(profile: CandidateProfile, resume: ResumeVersion): Promise<DocxDocument> {
  const {
    BorderStyle,
    Document,
    HeadingLevel,
    Paragraph,
    Table,
    TableCell,
    TableBorders,
    TableLayoutType,
    TableRow,
    TextRun,
    WidthType,
  } = await import("docx");

  const template = getResumeTemplateDefinition(resume.template);
  const accent = template.accent.replace("#", "").toUpperCase();
  const identity = getResumeIdentity(profile, resume);
  const paragraph = (text: string) =>
    new Paragraph({
      children: [new TextRun({ text, size: template.id === "editorial" ? 23 : 22 })],
      spacing: { after: template.id === "technical" ? 70 : 100 },
    });
  const heading = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({
          text,
          bold: true,
          color: accent,
          size: template.id === "editorial" ? 28 : 26,
          allCaps: template.id === "technical",
        }),
      ],
      border: {
        bottom:
          template.id === "editorial"
            ? undefined
            : {
                color: accent,
                size: template.id === "sidebar" ? 4 : 6,
                space: 1,
                style: BorderStyle.SINGLE,
              },
      },
      spacing: { before: template.id === "technical" ? 180 : 220, after: template.id === "technical" ? 90 : 120 },
    });
  const bullet = (text: string) =>
    new Paragraph({
      children: [new TextRun({ text, size: 22 })],
      bullet: { level: 0 },
      spacing: { after: 80 },
    });
  const section = (sectionData: { title: string; items: string[] }) => {
    const visibleItems = sectionData.items.filter(Boolean);
    if (!visibleItems.length) {
      return [];
    }
    return [
      heading(sectionData.title),
      ...(visibleItems.length === 1 ? [paragraph(visibleItems[0])] : visibleItems.map(bullet)),
    ];
  };

  const orderedSections = getOrderedResumeSections(resume);
  const sideSectionIds = new Set(["skills", "education", "awards"]);
  const children: Array<DocxParagraph | DocxTable> = [
    new Paragraph({
      children: [
        new TextRun({
          text: identity.name,
          bold: true,
          color: accent,
          size: template.id === "editorial" ? 40 : 34,
        }),
      ],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: formatContact(identity), color: "4C5A52", size: 20 })],
      spacing: { after: 220 },
    }),
  ];

  if (template.layout === "two-column-sidebar") {
    const sideChildren = orderedSections
      .filter((sectionData) => sideSectionIds.has(sectionData.id))
      .flatMap(section);
    const mainChildren = orderedSections
      .filter((sectionData) => !sideSectionIds.has(sectionData.id))
      .flatMap(section);

    children.push(
      new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: sideChildren }),
              new TableCell({ children: mainChildren }),
            ],
          }),
        ],
        columnWidths: [3100, 6400],
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        borders: TableBorders.NONE,
      }),
    );
  } else {
    children.push(...orderedSections.flatMap(section));
  }

  return new Document({
    creator: "JobFit AI Web",
    description: "Resume generated by JobFit AI Web",
    title: resume.title,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children,
      },
    ],
  });
}

export async function downloadDocxFile(profile: CandidateProfile, resume: ResumeVersion) {
  const { Packer } = await import("docx");
  const doc = await buildResumeDocument(profile, resume);
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${resume.title.replace(/[\\/:*?"<>|]/g, "-")}.docx`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function renderResumeHtml(profile: CandidateProfile, resume: ResumeVersion) {
  const template = getResumeTemplateDefinition(resume.template);
  const identity = getResumeIdentity(profile, resume);
  const accent = template.accent;
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const sectionHtml = (sectionData: { id: string; title: string; items: string[] }) => {
    const visibleItems = sectionData.items.filter(Boolean);
    if (!visibleItems.length) {
      return "";
    }
    const content =
      visibleItems.length === 1
        ? `<p>${escape(visibleItems[0])}</p>`
        : `<ul>${visibleItems.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>`;
    return `<section data-section-id="${escape(sectionData.id)}"><h2>${escape(sectionData.title)}</h2>${content}</section>`;
  };

  const orderedSections = getOrderedResumeSections(resume);
  const sideSectionIds = new Set(["skills", "education", "awards"]);
  const bodyHtml =
    template.layout === "two-column-sidebar"
      ? `<aside class="resume-side" aria-label="侧栏信息">${orderedSections
          .filter((sectionData) => sideSectionIds.has(sectionData.id))
          .map(sectionHtml)
          .join("")}</aside><div class="resume-main" aria-label="主要内容">${orderedSections
          .filter((sectionData) => !sideSectionIds.has(sectionData.id))
          .map(sectionHtml)
          .join("")}</div>`
      : orderedSections.map(sectionHtml).join("");

  const layoutStyles =
    template.layout === "two-column-sidebar"
      ? ` .resume-layout--two-column-sidebar { display: grid; grid-template-columns: minmax(0, 0.32fr) minmax(0, 0.68fr); gap: 14mm; align-items: start; } .resume-side, .resume-main { min-width: 0; } .resume-layout--two-column-sidebar h2 { border-bottom: 1px solid ${accent}; font-size: 12px; }`
      : "";
  const titleStyles = `
    .resume-layout--education-first h2 { border-bottom: 1px solid ${accent}; }
    .resume-layout--skills-first h2 { letter-spacing: 0.08em; text-transform: uppercase; }
    .resume-layout--experience-first h2 { border-bottom: 2px solid ${accent}; }
    .resume-layout--single-column h2 { border-bottom: 1px solid ${accent}; letter-spacing: 0.04em; }
    .resume-layout--project-first h2 { border-bottom: 0; color: ${accent}; font-size: 16px; letter-spacing: 0.02em; }
  `;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escape(resume.title)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { margin: 0; color: #151b17; font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif; line-height: 1.45; }
    .resume-sheet { max-width: 760px; margin: 0 auto; }
    header { border-bottom: 2px solid ${accent}; padding-bottom: 10px; margin-bottom: 12px; }
    h1 { margin: 0; color: ${accent}; font-size: ${template.id === "editorial" ? "31px" : "26px"}; letter-spacing: ${template.id === "editorial" ? "0.02em" : "0"}; }
    .meta { margin-top: 4px; color: #4c5a52; font-size: 12px; }
    .resume-layout { display: block; }
    h2 { margin: 14px 0 7px; border-bottom: 1px solid #d7ddd7; color: ${accent}; font-size: 14px; padding-bottom: 4px; }
    p, li { font-size: 12px; }
    p { margin: 0; }
    ul { margin: 0; padding-left: 18px; }
    li { margin: 4px 0; }${titleStyles}${layoutStyles}
    @media print { .resume-sheet { max-width: none; } }
  </style>
</head>
<body>
  <main class="resume-sheet" data-template-id="${escape(template.id)}" data-layout="${escape(template.layout)}">
    <header>
      <h1>${escape(identity.name)}</h1>
      <div class="meta">${escape(formatContact(identity))}</div>
    </header>
    <div class="resume-layout resume-layout--${escape(template.layout)}">${bodyHtml}</div>
  </main>
</body>
</html>`;
}

export function printResumeAsPdf(profile: CandidateProfile, resume: ResumeVersion) {
  const printWindow = window.open("", "_blank", "width=900,height=1200");
  if (!printWindow) {
    throw new Error("Popup blocked");
  }
  printWindow.document.open();
  printWindow.document.write(renderResumeHtml(profile, resume));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 250);
}
