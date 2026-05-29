import { DEFAULT_PROFILE, RESUME_TEMPLATE_OPTIONS, STATUS_OPTIONS } from "./constants";
import { createId, renderResumeText, splitLines, splitSkills } from "./resumeLogic";
import type {
  ApplicationRecord,
  CandidateProfile,
  InterviewQuestions,
  JobDraft,
  MatchReport,
  ResumeIdentity,
  ResumeSections,
  ResumeTemplate,
  ResumeVersion,
} from "./types";

export const STORAGE_KEY = "jobfit-ai-web-mvp";
export const STORAGE_VERSION = 1;

export interface StoredState {
  profile: CandidateProfile;
  resumes: ResumeVersion[];
  applications: ApplicationRecord[];
}

export interface StoredPayload extends StoredState {
  version: number;
  exportedAt?: string;
}

export function createInitialState(): StoredState {
  return {
    profile: { ...DEFAULT_PROFILE },
    resumes: [],
    applications: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function coerceDate(value: unknown) {
  const raw = coerceString(value);
  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? new Date().toISOString() : new Date(timestamp).toISOString();
}

function coerceStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return splitLines(value);
  }
  return [];
}

function coerceSkillArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return splitSkills(value);
  }
  return [];
}

function coerceResumeTemplate(value: unknown): ResumeTemplate {
  const raw = coerceString(value);
  return RESUME_TEMPLATE_OPTIONS.find((option) => option.value === raw)?.value ?? "graduate";
}

function coerceResumeIdentity(value: unknown): ResumeIdentity | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    name: coerceString(value.name),
    email: coerceString(value.email),
    phone: coerceString(value.phone),
    location: coerceString(value.location),
  };
}

function coerceProfile(value: unknown): CandidateProfile {
  const record = isRecord(value) ? value : {};
  return {
    name: coerceString(record.name, DEFAULT_PROFILE.name),
    email: coerceString(record.email, DEFAULT_PROFILE.email),
    phone: coerceString(record.phone, DEFAULT_PROFILE.phone),
    location: coerceString(record.location, DEFAULT_PROFILE.location),
    targetRole: coerceString(record.targetRole, DEFAULT_PROFILE.targetRole),
    headline: coerceString(record.headline, DEFAULT_PROFILE.headline),
    education: coerceString(record.education, DEFAULT_PROFILE.education),
    skills: coerceString(record.skills, DEFAULT_PROFILE.skills),
    projects: coerceString(record.projects, DEFAULT_PROFILE.projects),
    experience: coerceString(record.experience, DEFAULT_PROFILE.experience),
    awards: coerceString(record.awards, DEFAULT_PROFILE.awards),
  };
}

function coerceResumeSections(value: unknown): ResumeSections {
  const record = isRecord(value) ? value : {};
  return {
    summary: coerceString(record.summary, "已导入一份简历，可继续用于 JD 匹配。"),
    skills: coerceSkillArray(record.skills),
    education: coerceStringArray(record.education),
    projects: coerceStringArray(record.projects),
    experience: coerceStringArray(record.experience),
    awards: coerceStringArray(record.awards),
  };
}

function hasResumeContent(sections: ResumeSections, plainText: string) {
  return Boolean(
    plainText.trim() ||
      sections.summary.trim() ||
      sections.skills.length ||
      sections.education.length ||
      sections.projects.length ||
      sections.experience.length ||
      sections.awards.length,
  );
}

function coerceResume(value: unknown, profile: CandidateProfile): ResumeVersion | null {
  if (!isRecord(value)) {
    return null;
  }
  const sections = coerceResumeSections(value.sections);
  const plainText = coerceString(value.plainText) || renderResumeText(profile, sections);
  if (!hasResumeContent(sections, plainText)) {
    return null;
  }

  const rawSource = coerceString(value.source);
  const source: ResumeVersion["source"] =
    rawSource === "generated" || rawSource === "optimized" || rawSource === "uploaded"
      ? rawSource
      : "uploaded";

  return {
    id: coerceString(value.id) || createId("resume"),
    title: coerceString(value.title) || "未命名简历",
    source,
    template: coerceResumeTemplate(value.template),
    identity: coerceResumeIdentity(value.identity),
    targetRole: coerceString(value.targetRole) || profile.targetRole || "目标岗位",
    company: coerceString(value.company) || undefined,
    jobTitle: coerceString(value.jobTitle) || undefined,
    parentResumeId: coerceString(value.parentResumeId) || undefined,
    sections,
    plainText,
    unsupportedClaims: coerceStringArray(value.unsupportedClaims),
    reviewed: typeof value.reviewed === "boolean" ? value.reviewed : false,
    createdAt: coerceDate(value.createdAt),
    updatedAt: coerceDate(value.updatedAt),
  };
}

function coerceJobDraft(value: unknown): JobDraft {
  const record = isRecord(value) ? value : {};
  return {
    company: coerceString(record.company),
    title: coerceString(record.title),
    description: coerceString(record.description),
  };
}

function coerceReport(value: unknown): MatchReport {
  const record = isRecord(value) ? value : {};
  const rawScore = typeof record.score === "number" ? record.score : Number(record.score);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;
  return {
    score,
    weightedCoverage: Math.max(0, Math.min(100, Math.round(Number(record.weightedCoverage) || 0))),
    skillCoverage: Math.max(0, Math.min(100, Math.round(Number(record.skillCoverage) || 0))),
    projectCoverage: Math.max(0, Math.min(100, Math.round(Number(record.projectCoverage) || 0))),
    matchedKeywords: coerceStringArray(record.matchedKeywords),
    missingKeywords: coerceStringArray(record.missingKeywords),
    scoreBreakdown: coerceStringArray(record.scoreBreakdown),
    strengths: coerceStringArray(record.strengths),
    gaps: coerceStringArray(record.gaps),
    suggestions: coerceStringArray(record.suggestions),
    optimizedBullets: coerceStringArray(record.optimizedBullets),
  };
}

function coerceQuestions(value: unknown): InterviewQuestions {
  const record = isRecord(value) ? value : {};
  return {
    technical: coerceStringArray(record.technical),
    project: coerceStringArray(record.project),
    behavioral: coerceStringArray(record.behavioral),
  };
}

function coerceApplication(value: unknown): ApplicationRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawStatus = coerceString(value.status);
  const status = STATUS_OPTIONS.find((option) => option.value === rawStatus)?.value ?? "saved";
  const job = coerceJobDraft(value.job);
  const createdAt = coerceDate(value.createdAt);
  return {
    id: coerceString(value.id) || createId("app"),
    job,
    status,
    appliedAt: coerceString(value.appliedAt) || createdAt.slice(0, 10),
    channel: coerceString(value.channel) || "未记录",
    hrContact: coerceString(value.hrContact),
    followUpAt: coerceString(value.followUpAt),
    interviewAt: coerceString(value.interviewAt),
    notes: coerceString(value.notes),
    resumeId: coerceString(value.resumeId),
    resumeTitle: coerceString(value.resumeTitle) || "未命名简历",
    report: coerceReport(value.report),
    questions: coerceQuestions(value.questions),
    createdAt,
    updatedAt: coerceDate(value.updatedAt),
  };
}

export function normalizeStoredState(value: unknown): StoredState {
  if (!isRecord(value)) {
    return createInitialState();
  }

  const profile = coerceProfile(value.profile);
  const coercedResumes = Array.isArray(value.resumes)
    ? value.resumes.map((resume) => coerceResume(resume, profile)).filter((resume): resume is ResumeVersion => Boolean(resume))
    : [];
  const resumeIds = new Set(coercedResumes.map((resume) => resume.id));
  const resumes = coercedResumes.map((resume) =>
    resume.parentResumeId && !resumeIds.has(resume.parentResumeId)
      ? { ...resume, parentResumeId: undefined }
      : resume,
  );
  const resumeById = new Map(resumes.map((resume) => [resume.id, resume]));
  const applications = Array.isArray(value.applications)
    ? value.applications
        .map(coerceApplication)
        .filter((application): application is ApplicationRecord => Boolean(application && resumeById.has(application.resumeId)))
        .map((application) => ({
          ...application,
          resumeTitle: resumeById.get(application.resumeId)?.title ?? application.resumeTitle,
        }))
    : [];

  return { profile, resumes, applications };
}

export function looksLikeStoredPayload(value: unknown) {
  return (
    isRecord(value) &&
    value.version === STORAGE_VERSION &&
    isRecord(value.profile) &&
    Array.isArray(value.resumes) &&
    Array.isArray(value.applications)
  );
}

export function createStoredPayload(
  profile: CandidateProfile,
  resumes: ResumeVersion[],
  applications: ApplicationRecord[],
): StoredPayload {
  return {
    version: STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    profile,
    resumes,
    applications,
  };
}

export function loadStoredState(): StoredState {
  if (typeof window === "undefined") {
    return createInitialState();
  }

  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return createInitialState();
  }

  if (!saved) {
    return createInitialState();
  }

  try {
    return normalizeStoredState(JSON.parse(saved));
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures; the app can still run with in-memory defaults.
    }
    return createInitialState();
  }
}
