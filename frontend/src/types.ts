export type TabId = "workspace" | "integration" | "agent" | "templates" | "profile" | "builder" | "optimizer" | "applications";

export type ResumeSource = "generated" | "optimized" | "uploaded";

export type ResumeTemplate =
  | "graduate"
  | "graduate-research"
  | "internship"
  | "internship-project"
  | "experienced"
  | "experienced-specialist"
  | "technical"
  | "technical-timeline"
  | "sidebar"
  | "operations-impact"
  | "editorial"
  | "design-portfolio"
  | "management"
  | "consulting"
  | "academic"
  | "academic-compact";

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

export type ResumeSectionId = "intent" | "summary" | "skills" | "education" | "projects" | "experience" | "awards";

export type ResumeAudience =
  | "campus"
  | "internship"
  | "professional"
  | "technical"
  | "product-operations"
  | "design-creative"
  | "management-consulting"
  | "academic-research";

export type ResumeTemplateLayout =
  | "campus-growth"
  | "campus-research"
  | "internship-skills"
  | "internship-project"
  | "professional-impact"
  | "professional-depth"
  | "technical-ats"
  | "technical-timeline"
  | "product-sidebar"
  | "operations-metrics"
  | "design-editorial"
  | "portfolio-sidebar"
  | "management-brief"
  | "consulting-case"
  | "academic-classic"
  | "academic-compact";

export interface ResumeTemplateSource {
  kind: "original" | "open-source";
  creator: string;
  license: string;
  note: string;
  url?: string;
}

export interface ResumeTemplateDefinition {
  id: ResumeTemplate;
  name: string;
  audience: ResumeAudience;
  layout: ResumeTemplateLayout;
  accent: string;
  sectionOrder: ResumeSectionId[];
  description: string;
  version: string;
  source: ResumeTemplateSource;
}

export type ResumeFontFamily = "sans" | "serif" | "editorial";

export type ResumePageCount = 1 | 2;

export interface ResumeAppearance {
  fontFamily: ResumeFontFamily;
  fontSize: number;
  lineHeight: number;
  pageMargin: number;
  pageCount: ResumePageCount;
  accent?: string;
}

export type JobFrameworkId =
  | "python-backend"
  | "agent-rag"
  | "fullstack"
  | "data-analysis"
  | "campus-early-career"
  | "internship-entry"
  | "product-operations"
  | "design-creative"
  | "management-consulting"
  | "academic-research";

export interface JobFrameworkSection {
  id: string;
  title: string;
  placeholders: string[];
  evidenceChecks: string[];
  preparationQuestions: string[];
}

export interface JobFrameworkDefinition {
  id: JobFrameworkId;
  name: string;
  version: string;
  description: string;
  outline: JobFrameworkSection[];
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
  appearance?: ResumeAppearance;
  sections: ResumeSections;
  plainText: string;
  unsupportedClaims: string[];
  reviewed: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ResumeContentPatch = Partial<
  Pick<ResumeVersion, "identity" | "targetRole" | "sections" | "appearance">
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

export type OpportunityStage =
  | "new"
  | "saved"
  | "tailoring"
  | "applied"
  | "communicating"
  | "interviewing"
  | "offer"
  | "unsuitable"
  | "closed";

export type OpportunitySource = "workspace" | "boss" | "manual" | "csv";

export type ApplicationNextActionKind =
  | "review"
  | "tailor-resume"
  | "follow-up"
  | "prepare-interview"
  | "compare-offer";

export interface ApplicationNextAction {
  id: string;
  kind: ApplicationNextActionKind;
  title: string;
  dueAt: string;
  completedAt?: string;
  createdAt: string;
}

export interface OpportunityJob extends JobDraft {
  location?: string;
  salary?: string;
}

export interface OpportunityRecord {
  id: string;
  stage: OpportunityStage;
  job: OpportunityJob;
  source: OpportunitySource;
  sourceJobId?: string;
  sourceUrl?: string;
  applicationId?: string;
  resumeId?: string;
  channel: string;
  contact: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  stageChangedAt?: string;
  nextAction?: ApplicationNextAction;
}

export interface SavedJobView {
  id: string;
  name: string;
  query?: string;
  stages?: OpportunityStage[];
  source?: OpportunitySource;
}
