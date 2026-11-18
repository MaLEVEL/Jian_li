export type TabId = "workspace" | "agent" | "profile" | "builder" | "optimizer" | "applications";

export type ResumeSource = "generated" | "optimized" | "uploaded";

export type ResumeTemplate = "graduate" | "internship" | "experienced";

export type ApplicationStatus =
  | "saved"
  | "applied"
  | "screening"
  | "interviewing"
  | "offer"
  | "rejected";

export interface CandidateProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  targetRole: string;
  headline: string;
  education: string;
  skills: string;
  projects: string;
  experience: string;
  awards: string;
}

export interface ResumeIdentity {
  name: string;
  email: string;
  phone: string;
  location: string;
}

export interface ResumeSections {
  summary: string;
  skills: string[];
  education: string[];
  projects: string[];
  experience: string[];
  awards: string[];
}

export type QualityIssueLevel = "good" | "warn" | "bad";

export interface QualityIssue {
  id: string;
  level: QualityIssueLevel;
  title: string;
  detail: string;
}

export interface ResumeQualityReport {
  score: number;
  estimatedPages: number;
  contentUnits: number;
  issues: QualityIssue[];
}

export interface ResumeVersion {
  id: string;
  title: string;
  source: ResumeSource;
  template: ResumeTemplate;
  identity?: ResumeIdentity;
  targetRole: string;
  company?: string;
  jobTitle?: string;
  parentResumeId?: string;
  sections: ResumeSections;
  plainText: string;
  unsupportedClaims: string[];
  reviewed: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ResumeContentPatch = Partial<
  Pick<ResumeVersion, "identity" | "targetRole" | "sections">
>;

export interface ResumeImportDraft {
  title: string;
  identity: ResumeIdentity;
  targetRole: string;
  sections: ResumeSections;
}

export interface JobDraft {
  company: string;
  title: string;
  description: string;
}

export interface MatchReport {
  score: number;
  weightedCoverage: number;
  skillCoverage: number;
  projectCoverage: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  scoreBreakdown: string[];
  strengths: string[];
  gaps: string[];
  suggestions: string[];
  optimizedBullets: string[];
}

export interface MatchPreview {
  job: JobDraft;
  resumeId: string;
  resumeTitle: string;
  report: MatchReport;
  updatedAt: string;
}

export interface InterviewQuestions {
  technical: string[];
  project: string[];
  behavioral: string[];
}

export interface ApplicationRecord {
  id: string;
  job: JobDraft;
  status: ApplicationStatus;
  appliedAt: string;
  channel: string;
  hrContact: string;
  followUpAt: string;
  interviewAt: string;
  notes: string;
  resumeId: string;
  resumeTitle: string;
  report: MatchReport;
  questions: InterviewQuestions;
  createdAt: string;
  updatedAt: string;
}
