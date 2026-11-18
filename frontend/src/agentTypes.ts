export interface AgentHealth {
  status: string;
  mode: string;
  model: string;
  rag_mode: string;
}

export interface ParsedResume {
  text: string;
  filename: string;
}

export interface MaterialDraft {
  title: string;
  content: string;
  tags: string[];
}

export interface Material extends MaterialDraft {
  id: string;
  created_at: string;
}

export interface AgentSkillRequirement {
  name: string;
  required: boolean;
  weight: number;
}

export interface AgentJobInsight {
  skills: AgentSkillRequirement[];
  experience_years: number | null;
  domain: string;
}

export interface AgentResumeInsight {
  skills: string[];
  experience_years: number | null;
  projects: string[];
}

export interface AgentScoreBreakdownItem {
  skill: string;
  weight: number;
  matched: boolean;
  evidence: string;
}

export interface AgentAdvice {
  skill: string;
  suggestion: string;
  evidence_ids: string[];
  supported: boolean;
}

export interface AgentEvidence {
  id: string;
  title: string;
  content: string;
  score: number;
  source: string;
}

export interface AgentTraceNode {
  node: string;
  status: string;
  duration_ms: number;
}

export interface AgentTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface Analysis {
  id: string;
  company: string;
  title: string;
  score: number;
  mode: string;
  model: string;
  jd: AgentJobInsight;
  resume: AgentResumeInsight;
  matched_skills: string[];
  missing_skills: string[];
  breakdown: AgentScoreBreakdownItem[];
  explanation: string;
  advice: AgentAdvice[];
  evidence: AgentEvidence[];
  trace: AgentTraceNode[];
  warnings: string[];
  duration_ms: number;
  usage: AgentTokenUsage;
  created_at: string;
  rag_mode: string;
}

export interface AnalysisRequest {
  resume_text: string;
  jd_text: string;
  company?: string;
  title?: string;
}

export interface BatchJobInput {
  company: string;
  title: string;
  jd_text: string;
}

export interface BatchAnalysisRequest {
  resume_text: string;
  jobs: BatchJobInput[];
}

export interface BatchAnalysisError {
  index: number;
  title: string;
  error: string;
}

export interface BatchAnalysisResponse {
  results: Analysis[];
  errors: BatchAnalysisError[];
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
}

export interface SkillRunRequest {
  analysis_id: string;
}

export type SkillRunItemKind = "fact" | "proposal" | "study" | "question";

export interface SkillRunItem {
  heading: string;
  content: string;
  kind: SkillRunItemKind;
  source_ids: string[];
  review_required: boolean;
}

export interface SkillRunSection {
  title: string;
  items: SkillRunItem[];
}

export interface SkillRunSource {
  id: string;
  title: string;
  content: string;
}

export interface SkillRunResult {
  id: string;
  skill_id: string;
  skill_name: string;
  skill_version: string;
  analysis_id: string;
  title: string;
  mode: string;
  model: string;
  warnings: string[];
  duration_ms: number;
  usage: AgentTokenUsage;
  created_at: string;
  sections: SkillRunSection[];
  sources: SkillRunSource[];
}
