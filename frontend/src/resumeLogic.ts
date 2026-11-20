import type { Document as DocxDocument, Paragraph as DocxParagraph, Table as DocxTable } from "docx";
import { KEYWORD_BANK } from "./constants";
import { getResumeAppearanceDefaults, getResumeFontOption, getResumeSectionOrder, getResumeTemplateDefinition, isCenteredResumeHeader, isSidebarResumeLayout } from "./templateCatalog";
import { getResumePhotoDataUrl, normalizeResumePhotoPosition, parseJpegDataUrl } from "./resumePhoto";
import type {
  CandidateProfile,
  InterviewQuestions,
  JobDraft,
  MatchReport,
  QualityIssue,
  ResumeQualityReport,
  ResumeAppearance,
  ResumeIdentity,
  ResumeSections,
  ResumeSectionId,
  ResumeTemplateLayout,
  ResumeVersion,
} from "./types";

export function resolveResumeAppearance(resume: ResumeVersion): ResumeAppearance {
  const defaults = getResumeAppearanceDefaults(getResumeTemplateDefinition(resume.template));
  const appearance = resume.appearance;
  if (!appearance) {
    return defaults;
  }
  const photoDataUrl = getResumePhotoDataUrl(appearance.photoDataUrl);
  return {
    fontFamily: appearance.fontFamily ?? defaults.fontFamily,
    fontSize: appearance.fontSize ?? defaults.fontSize,
    lineHeight: appearance.lineHeight ?? defaults.lineHeight,
    pageMargin: appearance.pageMargin ?? defaults.pageMargin,
    pageCount: appearance.pageCount ?? defaults.pageCount,
    accent: appearance.accent ?? defaults.accent,
    ...(photoDataUrl
      ? { photoDataUrl, photoPosition: normalizeResumePhotoPosition(appearance.photoPosition) }
      : {}),
  };
}
export function inheritResumeAppearance(resume: Pick<ResumeVersion, "appearance">): ResumeAppearance | undefined {
  return resume.appearance ? { ...resume.appearance } : undefined;
}

const DOCX_LAYOUT_PROFILES: Record<ResumeTemplateLayout, {
  centeredHeader: boolean;
  titleExtra: number;
  headingBorderSize: number;
  headingIndent?: number;
  paragraphIndent?: number;
  headingBefore: number;
  headingAfter: number;
  paragraphAfter: number;
  bulletAfter: number;
  allCaps: boolean;
}> = {
  "campus-growth": { centeredHeader: false, titleExtra: 8, headingBorderSize: 6, headingBefore: 180, headingAfter: 100, paragraphAfter: 100, bulletAfter: 80, allCaps: false },
  "campus-research": { centeredHeader: true, titleExtra: 6, headingBorderSize: 0, headingBefore: 170, headingAfter: 100, paragraphAfter: 90, bulletAfter: 70, allCaps: false },
  "internship-skills": { centeredHeader: false, titleExtra: 6, headingBorderSize: 0, headingBefore: 150, headingAfter: 100, paragraphAfter: 90, bulletAfter: 75, allCaps: false },
  "internship-project": { centeredHeader: false, titleExtra: 7, headingBorderSize: 2, headingBefore: 165, headingAfter: 100, paragraphAfter: 110, bulletAfter: 95, allCaps: false },
  "professional-impact": { centeredHeader: false, titleExtra: 8, headingBorderSize: 10, headingBefore: 200, headingAfter: 110, paragraphAfter: 110, bulletAfter: 85, allCaps: false },
  "professional-depth": { centeredHeader: false, titleExtra: 6, headingBorderSize: 0, headingIndent: 240, paragraphIndent: 240, headingBefore: 190, headingAfter: 100, paragraphAfter: 100, bulletAfter: 80, allCaps: false },
  "technical-ats": { centeredHeader: false, titleExtra: 4, headingBorderSize: 4, headingBefore: 150, headingAfter: 80, paragraphAfter: 80, bulletAfter: 65, allCaps: true },
  "technical-timeline": { centeredHeader: false, titleExtra: 6, headingBorderSize: 0, headingIndent: 260, paragraphIndent: 500, headingBefore: 170, headingAfter: 95, paragraphAfter: 95, bulletAfter: 75, allCaps: false },
  "product-sidebar": { centeredHeader: false, titleExtra: 5, headingBorderSize: 4, headingBefore: 165, headingAfter: 90, paragraphAfter: 95, bulletAfter: 75, allCaps: false },
  "operations-metrics": { centeredHeader: false, titleExtra: 7, headingBorderSize: 8, headingBefore: 185, headingAfter: 105, paragraphAfter: 105, bulletAfter: 85, allCaps: false },
  "design-editorial": { centeredHeader: false, titleExtra: 16, headingBorderSize: 0, headingBefore: 180, headingAfter: 100, paragraphAfter: 105, bulletAfter: 85, allCaps: false },
  "portfolio-sidebar": { centeredHeader: false, titleExtra: 9, headingBorderSize: 4, headingBefore: 170, headingAfter: 90, paragraphAfter: 95, bulletAfter: 75, allCaps: false },
  "management-brief": { centeredHeader: false, titleExtra: 10, headingBorderSize: 12, headingBefore: 220, headingAfter: 110, paragraphAfter: 115, bulletAfter: 90, allCaps: false },
  "consulting-case": { centeredHeader: false, titleExtra: 7, headingBorderSize: 4, headingIndent: 180, paragraphIndent: 180, headingBefore: 190, headingAfter: 100, paragraphAfter: 110, bulletAfter: 110, allCaps: false },
  "academic-classic": { centeredHeader: true, titleExtra: 5, headingBorderSize: 4, headingBefore: 210, headingAfter: 90, paragraphAfter: 85, bulletAfter: 70, allCaps: false },
  "academic-compact": { centeredHeader: true, titleExtra: 4, headingBorderSize: 4, headingBefore: 100, headingAfter: 55, paragraphAfter: 55, bulletAfter: 45, allCaps: false },
};
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
  const appearance = resolveResumeAppearance(resume);
  const template = getResumeTemplateDefinition(resume.template);

  const baseArea = (210 - 32) * (297 - 32);
  const usableArea = (210 - appearance.pageMargin * 2) * (297 - appearance.pageMargin * 2);
  const typographyFactor = Math.pow(12 / appearance.fontSize, 1.8) * (1.55 / appearance.lineHeight);
  const layoutFactor = isSidebarResumeLayout(template.layout)
    ? 0.86
    : template.layout === "academic-compact"
      ? 1.08
      : 1;
  const estimatedUnitsPerPage = Math.max(420, 1150 * typographyFactor * (usableArea / baseArea) * layoutFactor);
  const estimatedPages = Math.max(1, Math.ceil(contentUnits / estimatedUnitsPerPage));
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

  const pageBudget = resolveResumeAppearance(resume).pageCount;
  if (estimatedPages > pageBudget) {
    issues.push({
      id: "one-page",
      level: "warn",
      title: `可能超过${pageBudget === 1 ? "一页" : "两页"}`,
      detail: `当前内容估算约 ${estimatedPages} 页，建议压缩低相关经历，优先保留和目标岗位最相关的项目。`,
    });
  } else if (pageBudget === 2 && estimatedPages === 2) {
    issues.push({
      id: "one-page",
      level: "good",
      title: "适合双页简历",
      detail: "当前内容量在双页预算内，导出时仍请检查分页处是否切断关键项目。",
    });
  } else {
    issues.push({
      id: "one-page",
      level: "good",
      title: pageBudget === 1 ? "一页纸可读" : "双页简历仍较精简",
      detail: pageBudget === 1 ? "当前内容量适合一页纸简历，导出前再检查排版密度。" : "当前内容可放在两页内，也可以切换单页获得更紧凑的表达。",
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
    AlignmentType,
    BorderStyle,
    Document,
    Header,
    HeadingLevel,
    ImageRun,
    Paragraph,
    Table,
    TableCell,
    TableBorders,
    TableLayoutType,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
  } = await import("docx");

  const template = getResumeTemplateDefinition(resume.template);
  const layoutProfile = DOCX_LAYOUT_PROFILES[template.layout];
  const appearance = resolveResumeAppearance(resume);
  const font = getResumeFontOption(appearance.fontFamily);
  const accent = (appearance.accent ?? template.accent).replace("#", "").toUpperCase();
  const identity = getResumeIdentity(profile, resume);
  const photoBytes = parseJpegDataUrl(appearance.photoDataUrl);
  const photoPosition = normalizeResumePhotoPosition(appearance.photoPosition);
  const bodySize = Math.round(appearance.fontSize * 2);
  const headingSize = bodySize + 4;
  const lineSpacing = Math.round(appearance.lineHeight * 240);
  const pageMargin = Math.round(appearance.pageMargin * 56.7);
  const sideSectionIds = new Set<ResumeSectionId>(["skills", "education", "awards"]);

  const paragraph = (text: string) =>
    new Paragraph({
      children: [new TextRun({ text, font: font.wordFont, size: bodySize })],
      spacing: { line: lineSpacing, after: layoutProfile.paragraphAfter },
      indent: layoutProfile.paragraphIndent ? { left: layoutProfile.paragraphIndent } : undefined,
    });
  const heading = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({
          text,
          font: font.wordFont,
          bold: true,
          color: accent,
          size: headingSize,
          allCaps: layoutProfile.allCaps,
        }),
      ],
      border: {
        bottom:
          layoutProfile.headingBorderSize > 0
            ? {
                color: accent,
                size: layoutProfile.headingBorderSize,
                space: 1,
                style: BorderStyle.SINGLE,
              }
            : undefined,
      },
      indent: layoutProfile.headingIndent ? { left: layoutProfile.headingIndent } : undefined,
      spacing: {
        before: layoutProfile.headingBefore,
        after: layoutProfile.headingAfter,
      },
    });
  const bullet = (text: string) =>
    new Paragraph({
      children: [new TextRun({ text, font: font.wordFont, size: bodySize })],
      bullet: { level: 0 },
      indent: layoutProfile.paragraphIndent ? { left: layoutProfile.paragraphIndent + 240 } : undefined,
      spacing: { line: lineSpacing, after: layoutProfile.bulletAfter },
    });
  const section = (sectionData: { id: ResumeSectionId; title: string; items: string[] }) => {
    const visibleItems = sectionData.items.filter(Boolean);
    if (!visibleItems.length) {
      return [];
    }
    return [
      heading(sectionData.title),
      ...(visibleItems.length === 1 ? [paragraph(visibleItems[0])] : visibleItems.map(bullet)),
    ];
  };

  const titleParagraph = new Paragraph({
    children: [
      new TextRun({
        text: identity.name,
        font: font.wordFont,
        bold: true,
        color: accent,
        size: bodySize + layoutProfile.titleExtra,
      }),
    ],
    alignment: layoutProfile.centeredHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: 80 },
  });
  const contactParagraph = new Paragraph({
    children: [new TextRun({ text: formatContact(identity), font: font.wordFont, color: "4C5A52", size: bodySize - 2 })],
    alignment: layoutProfile.centeredHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { line: lineSpacing, after: 220 },
  });

  const children: Array<DocxParagraph | DocxTable> = [];
  let firstPageHeader: InstanceType<typeof Header> | undefined;
  if (photoBytes) {
    const identityCell = new TableCell({
      children: [titleParagraph, contactParagraph],
      verticalAlign: VerticalAlign.CENTER,
    });
    const photoCell = new TableCell({
      children: [
        new Paragraph({
          alignment: layoutProfile.centeredHeader
            ? AlignmentType.CENTER
            : photoPosition === "left"
              ? AlignmentType.LEFT
              : AlignmentType.RIGHT,
          children: [
            new ImageRun({
              type: "jpg",
              data: photoBytes,
              transformation: { width: 96, height: 128 },
              altText: {
                name: `${identity.name || "求职者"}照片`,
                title: "简历照片",
                description: "居中裁切为 3:4 的 JPEG 简历照片",
              },
            }),
          ],
        }),
      ],
      verticalAlign: VerticalAlign.CENTER,
    });
    const blankCell = () =>
      new TableCell({ children: [new Paragraph("")], verticalAlign: VerticalAlign.CENTER });
    const headerCells = layoutProfile.centeredHeader
      ? photoPosition === "left"
        ? [photoCell, identityCell, blankCell()]
        : [blankCell(), identityCell, photoCell]
      : photoPosition === "left"
        ? [photoCell, identityCell]
        : [identityCell, photoCell];

    firstPageHeader = new Header({
      children: [
        new Table({
          rows: [new TableRow({ children: headerCells })],
          columnWidths: layoutProfile.centeredHeader
            ? [1300, 7400, 1300]
            : photoPosition === "left"
              ? [1600, 8400]
              : [8400, 1600],
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          borders: TableBorders.NONE,
        }),
      ],
    });
  } else {
    children.push(titleParagraph, contactParagraph);
  }

  const orderedSections = getOrderedResumeSections(resume);
  if (isSidebarResumeLayout(template.layout)) {
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
        columnWidths: template.layout === "portfolio-sidebar" ? [3000, 6500] : [3400, 6100],
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        borders: TableBorders.NONE,
      }),
    );
  } else {
    children.push(...orderedSections.flatMap(section));
  }

  return new Document({
    creator: "职启云帆 Web",
    description: "Resume generated by 职启云帆 Web",
    title: resume.title,
    sections: [
      {
        headers: firstPageHeader ? { first: firstPageHeader } : undefined,
        properties: {
          titlePage: Boolean(photoBytes),
          page: {
            margin: {
              top: pageMargin,
              right: pageMargin,
              bottom: pageMargin,
              left: pageMargin,
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
  const appearance = resolveResumeAppearance(resume);
  const font = getResumeFontOption(appearance.fontFamily);
  const identity = getResumeIdentity(profile, resume);
  const accent = /^#[0-9a-f]{6}$/i.test(appearance.accent ?? "") ? appearance.accent! : template.accent;
  const photoDataUrl = getResumePhotoDataUrl(appearance.photoDataUrl);
  const photoPosition = normalizeResumePhotoPosition(appearance.photoPosition);
  const centeredHeader = isCenteredResumeHeader(template.layout);
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
  const bodyHtml = isSidebarResumeLayout(template.layout)
    ? `<aside class="resume-side" aria-label="侧栏信息">${orderedSections
        .filter((sectionData) => sideSectionIds.has(sectionData.id))
        .map(sectionHtml)
        .join("")}</aside><div class="resume-main" aria-label="主要内容">${orderedSections
        .filter((sectionData) => !sideSectionIds.has(sectionData.id))
        .map(sectionHtml)
        .join("")}</div>`
    : orderedSections.map(sectionHtml).join("");

  const layoutStyles: Record<string, string> = {
    "campus-growth": `.resume-layout--campus-growth h2 { border-bottom: 1.5px solid ${accent}; }`,
    "campus-research": `.resume-layout--campus-research h2 { border-top: 1px solid ${accent}; border-bottom: 0; padding-top: 5px; }`,
    "internship-skills": `.resume-layout--internship-skills h2 { display: inline-block; padding: 2px 8px; background: ${accent}14; border-bottom: 0; }`,
    "internship-project": `.resume-layout--internship-project section[data-section-id="projects"] { padding: 12px 0; border-block: 1px solid ${accent}55; }`,
    "professional-impact": `.resume-layout--professional-impact h2 { border-bottom: 2px solid ${accent}; letter-spacing: .04em; }`,
    "professional-depth": `.resume-layout--professional-depth h2 { color: #283e4a; border-left: 4px solid ${accent}; padding-left: 8px; border-bottom: 0; }`,
    "technical-ats": `.resume-layout--technical-ats h2 { text-transform: uppercase; letter-spacing: .1em; border-bottom: 1px solid #9aabb4; }`,
    "technical-timeline": `.resume-layout--technical-timeline section { margin-left: 12px; padding-left: 16px; border-left: 2px solid ${accent}55; } .resume-layout--technical-timeline h2::before { content: ""; display: inline-block; width: 7px; height: 7px; margin: 0 8px 1px -21px; border-radius: 50%; background: ${accent}; }`,
    "product-sidebar": `.resume-layout--product-sidebar { display: grid; grid-template-columns: minmax(0, 0.32fr) minmax(0, 0.68fr); gap: 14mm; align-items: start; } .resume-layout--product-sidebar .resume-side { padding: 9mm 5mm; background: ${accent}10; }`,
    "operations-metrics": `.resume-layout--operations-metrics h2 { border-bottom: 3px solid ${accent}; } .resume-layout--operations-metrics section[data-section-id="awards"] { padding: 8px 10px; background: ${accent}0d; }`,
    "design-editorial": `.resume-layout--design-editorial h2 { border-bottom: 0; color: ${accent}; font-size: 1.45em; } .resume-layout--design-editorial section[data-section-id="projects"] { padding: 10px 0; border-block: 1px solid #d6e7ef; }`,
    "portfolio-sidebar": `.resume-layout--portfolio-sidebar { display: grid; grid-template-columns: minmax(0, 0.3fr) minmax(0, 0.7fr); gap: 13mm; align-items: start; } .resume-layout--portfolio-sidebar .resume-side { border-right: 1px solid ${accent}; padding-right: 6mm; }`,
    "management-brief": `.resume-sheet[data-layout="management-brief"] .resume-header { padding-bottom: 12px; border-bottom: 5px solid ${accent}; } .resume-layout--management-brief h2 { border-bottom: 1px solid #a6bcc7; }`,
    "consulting-case": `.resume-layout--consulting-case h2 { border-left: 3px solid ${accent}; padding-left: 7px; border-bottom: 1px solid #cbd8de; } .resume-layout--consulting-case li { margin-block: 5px; }`,
    "academic-classic": `.resume-layout--academic-classic h2 { border-bottom: 1px solid ${accent}; text-transform: uppercase; letter-spacing: .06em; }`,
    "academic-compact": `.resume-layout--academic-compact h2 { border-bottom: 1px solid #9fb4bf; font-size: 1.05em; } .resume-layout--academic-compact section { margin-top: 9px; }`,
  };

  const photoHeaderStyles = photoDataUrl
    ? `
    .resume-header--has-photo { display: grid; align-items: center; gap: 6mm; }
    .resume-header--photo-left { grid-template-columns: 28mm minmax(0, 1fr); }
    .resume-header--photo-right { grid-template-columns: minmax(0, 1fr) 28mm; }
    .resume-header--centered.resume-header--has-photo { grid-template-columns: 28mm minmax(0, 1fr) 28mm; text-align: center; }
    .resume-header--centered.resume-header--has-photo .resume-header__identity { grid-column: 2; text-align: center; }
    .resume-header--centered.resume-header--photo-left .resume-photo { grid-column: 1; }
    .resume-header--centered.resume-header--photo-right .resume-photo { grid-column: 3; }
    .resume-photo { display: block; width: 100%; aspect-ratio: 3 / 4; object-fit: cover; border: 1px solid ${accent}55; border-radius: 2mm; background: #f4f7f8; print-color-adjust: exact; }
    `
    : "";
  const headerClass = [
    "resume-header",
    centeredHeader ? "resume-header--centered" : "",
    photoDataUrl ? "resume-header--has-photo" : "",
    photoDataUrl ? `resume-header--photo-${photoPosition}` : "",
  ].filter(Boolean).join(" ");
  const photoHtml = photoDataUrl
    ? `<img class="resume-photo" src="${escape(photoDataUrl)}" alt="${escape(identity.name || "求职者")}的照片" data-photo-position="${photoPosition}" />`
    : "";
  const identityHtml = `<div class="resume-header__identity"><h1>${escape(identity.name)}</h1><div class="meta">${escape(formatContact(identity))}</div></div>`;
  const headerHtml = photoDataUrl && photoPosition === "left"
    ? `${photoHtml}${identityHtml}`
    : `${identityHtml}${photoHtml}`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escape(resume.title)}</title>
  <style>
    @page { size: A4; margin: ${appearance.pageMargin}mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #151b17; font-family: ${font.stack}; font-size: ${appearance.fontSize}pt; line-height: ${appearance.lineHeight}; }
    .resume-sheet { width: auto; max-width: 210mm; min-height: ${appearance.pageCount === 1 ? "297mm" : "594mm"}; margin: 0 auto; padding: 0; background: white; }
    .resume-sheet[data-page-count="2"] { box-shadow: inset 0 0 0 1px #e1edf3; }
    header.resume-header { border-bottom: 2px solid ${accent}; padding-bottom: 10px; margin-bottom: 12px; }
    .resume-header--centered { text-align: center; }
    h1 { margin: 0; color: ${accent}; font-size: ${template.layout === "design-editorial" ? "2.35em" : "2em"}; letter-spacing: ${template.layout === "design-editorial" ? "0.02em" : "0"}; }
    .meta { margin-top: 4px; color: #4c5a52; font-size: .88em; }
    .resume-layout { display: block; }
    h2 { margin: 1.1em 0 .55em; border-bottom: 1px solid #d7ddd7; color: ${accent}; font-size: 1.15em; padding-bottom: 4px; }
    p, li { font-size: 1em; }
    p { margin: 0; }
    ul { margin: 0; padding-left: 18px; }
    li { margin: .28em 0; }
    .resume-side, .resume-main { min-width: 0; }
    ${layoutStyles[template.layout]}
    ${photoHeaderStyles}
    @media screen {
      body { padding: 24px; background: #edf5f9; }
      .resume-sheet { width: 210mm; padding: ${appearance.pageMargin}mm; box-shadow: 0 8px 28px #1d4d6517; }
    }
    @media print {
      .resume-sheet { width: auto; min-height: auto; max-width: none; padding: 0; box-shadow: none; }
      section { break-inside: avoid-page; }
    }
  </style>
</head>
<body>
  <main class="resume-sheet" data-template-id="${escape(template.id)}" data-layout="${escape(template.layout)}" data-page-count="${appearance.pageCount}" data-header-layout="${centeredHeader ? "centered" : "leading"}">
    <header class="${headerClass}" data-photo-position="${photoPosition}">${headerHtml}</header>
    <div class="resume-layout resume-layout--${escape(template.layout)}">${bodyHtml}</div>
  </main>
</body>
</html>`;
}
function waitForImageElement(image: HTMLImageElement) {
  if (image.complete) {
    return image.naturalWidth > 0 ? Promise.resolve() : Promise.reject(new Error("Image load failed"));
  }
  return new Promise<void>((resolve, reject) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => reject(new Error("Image load failed")), { once: true });
  });
}

export async function waitForResumePrintReady(printWindow: Window) {
  const printDocument = printWindow.document;
  await Promise.all(Array.from(printDocument.images).map(waitForImageElement));
  if (printDocument.fonts) {
    await printDocument.fonts.ready;
  }
}

export async function printResumeAsPdf(profile: CandidateProfile, resume: ResumeVersion) {
  const printWindow = window.open("", "_blank", "width=900,height=1200");
  if (!printWindow) {
    throw new Error("Popup blocked");
  }
  printWindow.document.open();
  printWindow.document.write(renderResumeHtml(profile, resume));
  printWindow.document.close();
  await waitForResumePrintReady(printWindow);
  printWindow.focus();
  printWindow.print();
}
