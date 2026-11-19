import {
  BookOpenCheck,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Copy,
  FileText,
  Lightbulb,
  MapPin,
  MessageCircleQuestion,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundCheck,
  Video,
} from "lucide-react";
import { type KeyboardEvent, useId, useState } from "react";
import type { ResumeVersion, TabId } from "../types";
import "./InterviewPackage.css";

export interface InterviewPackageJob {
  company: string;
  title: string;
  description?: string;
  location?: string;
  interviewAt?: string;
  format?: "phone" | "video" | "onsite";
}

export interface InterviewPackageRule {
  id: string;
  title: string;
  summary: string;
  basis: "job" | "resume" | "rule";
  evidence?: string[];
}

export interface InterviewPackageChecklistItem {
  id: string;
  title: string;
  detail?: string;
  completed: boolean;
}

export interface InterviewPackageTimelineItem {
  id: string;
  title: string;
  detail: string;
  minutes: number;
}

export interface InterviewPackageQuestions {
  technical?: string[];
  project?: string[];
  behavioral?: string[];
}

export interface InterviewPackageProps {
  opportunityId?: string;
  job?: InterviewPackageJob | null;
  resume?: Pick<ResumeVersion, "id" | "title" | "targetRole" | "plainText"> | null;
  match?: {
    score?: number;
    strengths?: string[];
    gaps?: string[];
  };
  rules?: InterviewPackageRule[];
  questions?: InterviewPackageQuestions;
  checklist?: InterviewPackageChecklistItem[];
  timeline?: InterviewPackageTimelineItem[];
  onToggleChecklist?: (itemId: string, completed: boolean) => void;
  onOpenResume?: () => void;
  onNavigate?: (tab: TabId) => void;
}

type QuestionTab = keyof InterviewPackageQuestions;

const QUESTION_TABS: Array<{ id: QuestionTab; label: string }> = [
  { id: "technical", label: "专业题" },
  { id: "project", label: "项目题" },
  { id: "behavioral", label: "行为题" },
];

const BASIS_LABELS: Record<InterviewPackageRule["basis"], string> = {
  job: "岗位要求",
  resume: "简历事实",
  rule: "准备规则",
};

const DEFAULT_TIMELINE: InterviewPackageTimelineItem[] = [
  { id: "company", title: "公司与人岗再确认", detail: "核对业务、团队、岗位目标和最近公开信息。", minutes: 8 },
  { id: "stories", title: "证据故事卡", detail: "把最强项目压缩成背景、动作、结果、复盘。", minutes: 12 },
  { id: "questions", title: "问题与追问预演", detail: "每个答案准备一个数据追问和一个风险追问。", minutes: 10 },
];

const DEFAULT_CHECKLIST: InterviewPackageChecklistItem[] = [
  { id: "resume", title: "简历事实可复述", detail: "项目数字、职责边界和个人贡献都能给出证据。", completed: false },
  { id: "story", title: "准备三个核心故事", detail: "覆盖成果、协作和失败复盘。", completed: false },
  { id: "questions", title: "准备反问问题", detail: "问题聚焦业务目标、团队协作与成功标准。", completed: false },
];

function handleQuestionTabKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  idPrefix: string,
  setActiveTab: (tab: QuestionTab) => void,
) {
  let nextIndex: number | undefined;
  if (event.key === "ArrowRight") nextIndex = (index + 1) % QUESTION_TABS.length;
  if (event.key === "ArrowLeft") nextIndex = (index - 1 + QUESTION_TABS.length) % QUESTION_TABS.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = QUESTION_TABS.length - 1;
  if (nextIndex === undefined) return;
  event.preventDefault();
  const nextTab = QUESTION_TABS[nextIndex];
  setActiveTab(nextTab.id);
  window.requestAnimationFrame(() => document.getElementById(`${idPrefix}-${nextTab.id}`)?.focus());
}

function formatInterviewTime(value?: string) {
  if (!value) return "面试时间待确认";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildDefaultRules(
  match: InterviewPackageProps["match"],
  resume: InterviewPackageProps["resume"],
): InterviewPackageRule[] {
  const strengths = match?.strengths?.filter(Boolean).slice(0, 3) ?? [];
  const gaps = match?.gaps?.filter(Boolean).slice(0, 3) ?? [];
  if (!strengths.length && !gaps.length) return [];

  const result: InterviewPackageRule[] = [];
  if (strengths.length) {
    result.push({
      id: "strengths",
      title: "先讲与岗位最接近的证据",
      summary: "把匹配优势放在回答主线里，每个优势绑定一个可追问的真实事实。",
      basis: "resume",
      evidence: strengths,
    });
  }
  if (gaps.length) {
    result.push({
      id: "gaps",
      title: "把缺口转成学习与迁移计划",
      summary: "承认边界，再说明已经采取的动作、验证方式和预计补齐路径。",
      basis: "rule",
      evidence: gaps,
    });
  }
  result.push({
    id: "resume-source",
    title: "所有回答都可以回到简历来源",
    summary: resume ? `以「${resume.title}」中的真实内容为准，不扩写未验证的数字或职责。` : "先选定一份简历，再开始组织证明材料。",
    basis: "resume",
  });
  return result;
}

export function InterviewPackage({
  job,
  resume,
  match,
  rules = [],
  questions = {},
  checklist = DEFAULT_CHECKLIST,
  timeline = DEFAULT_TIMELINE,
  onToggleChecklist,
  onOpenResume,
  onNavigate,
}: InterviewPackageProps) {
  const questionPanelId = useId();
  const questionTabId = (tab: QuestionTab) => `${questionPanelId}-${tab}`;
  const [activeQuestionTab, setActiveQuestionTab] = useState<QuestionTab>("technical");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const resolvedRules = rules.length ? rules : buildDefaultRules(match, resume);
  const resolvedQuestions = questions[activeQuestionTab] ?? [];
  const completedChecklist = checklist.filter((item) => item.completed).length;
  const completionPercent = checklist.length ? Math.round((completedChecklist / checklist.length) * 100) : 0;

  if (!job) {
    return (
      <section className="interview-package interview-package--empty" aria-labelledby="interview-package-empty-title">
        <div className="interview-package__empty-mark" aria-hidden="true"><Sparkles size={30} /></div>
        <span>面试准备</span>
        <h2 id="interview-package-empty-title">先选择一个进入面试阶段的机会</h2>
        <p>机会确认后，这里会汇总岗位要求、简历证据、问题清单和规则化准备步骤。</p>
        <button type="button" className="primary-button" onClick={() => onNavigate?.("applications")}>
          去机会列表<ChevronRight size={16} aria-hidden="true" />
        </button>
      </section>
    );
  }

  async function copyQuestions() {
    const text = resolvedQuestions.map((question, index) => `${index + 1}. ${question}`).join("\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <section className="interview-package" aria-labelledby="interview-package-title">
      <header className="interview-package__hero">
        <div className="interview-package__hero-copy">
          <span className="interview-package__eyebrow"><BookOpenCheck size={16} aria-hidden="true" />岗位面试包</span>
          <h2 id="interview-package-title">{job.title}</h2>
          <p>{job.company}</p>
          <div className="interview-package__hero-meta">
            <span><Clock3 size={15} aria-hidden="true" />{formatInterviewTime(job.interviewAt)}</span>
            {job.format ? (
              <span>{job.format === "onsite" ? <MapPin size={15} aria-hidden="true" /> : <Video size={15} aria-hidden="true" />}{job.format === "onsite" ? "现场面试" : job.format === "video" ? "视频面试" : "电话沟通"}</span>
            ) : null}
            {job.location ? <span><MapPin size={15} aria-hidden="true" />{job.location}</span> : null}
          </div>
        </div>
        <div className="interview-package__score" aria-label={match?.score === undefined ? "尚未计算匹配分" : `岗位匹配分 ${match.score}`}>
          <span>匹配分</span>
          <strong>{match?.score ?? "—"}</strong>
          <small>{match?.score === undefined ? "等待分析" : match.score >= 75 ? "证据较完整" : "优先补强缺口"}</small>
        </div>
      </header>

      <div className="interview-package__layout">
        <main className="interview-package__main">
          <section className="interview-package__section" aria-labelledby="package-rules-title">
            <div className="interview-package__section-heading">
              <div>
                <span>规则组装</span>
                <h3 id="package-rules-title">这次面试的主线</h3>
              </div>
              <ShieldCheck size={20} aria-hidden="true" />
            </div>

            {resolvedRules.length ? (
              <div className="interview-rule-grid">
                {resolvedRules.map((rule, index) => (
                  <article key={rule.id} className="interview-rule-card">
                    <div className="interview-rule-card__top">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <em className={`interview-rule-card__basis is-${rule.basis}`}>{BASIS_LABELS[rule.basis]}</em>
                    </div>
                    <h4>{rule.title}</h4>
                    <p>{rule.summary}</p>
                    {rule.evidence?.length ? (
                      <ul>{rule.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="interview-package__inline-empty" role="status">
                <Lightbulb size={22} aria-hidden="true" />
                <p>还没有分析证据。补充匹配优势与缺口后，这里会生成可审阅的准备主线。</p>
              </div>
            )}
          </section>

          <section className="interview-package__section" aria-labelledby="package-timeline-title">
            <div className="interview-package__section-heading">
              <div>
                <span>30 分钟准备</span>
                <h3 id="package-timeline-title">从事实到表达</h3>
              </div>
              <Clock3 size={20} aria-hidden="true" />
            </div>
            {timeline.length ? (
              <ol className="interview-timeline">
                {timeline.map((item, index) => (
                  <li key={item.id}>
                    <span aria-hidden="true">{index + 1}</span>
                    <div><strong>{item.title}</strong><p>{item.detail}</p></div>
                    <em>{item.minutes} 分钟</em>
                  </li>
                ))}
              </ol>
            ) : <p className="interview-package__muted">准备计划尚未生成。</p>}
          </section>

          <section className="interview-package__section interview-package__description" aria-labelledby="package-job-title">
            <div className="interview-package__section-heading">
              <div>
                <span>岗位原文</span>
                <h3 id="package-job-title">保留判断依据</h3>
              </div>
              <BriefcaseBusiness size={20} aria-hidden="true" />
            </div>
            <p>{job.description || "当前机会没有传入岗位描述。建议在面试前补全职责、要求和团队信息。"}</p>
          </section>
        </main>

        <aside className="interview-package__side">
          <section className="interview-package__questions" aria-labelledby="package-questions-title">
            <div className="interview-package__section-heading">
              <div>
                <span>练习题库</span>
                <h3 id="package-questions-title">带着证据回答</h3>
              </div>
              <MessageCircleQuestion size={20} aria-hidden="true" />
            </div>
            <div className="interview-question-tabs" role="tablist" aria-label="面试题分类">
              {QUESTION_TABS.map((tab, index) => (
                <button
                  key={tab.id}
                  id={questionTabId(tab.id)}
                  type="button"
                  role="tab"
                  aria-selected={activeQuestionTab === tab.id}
                  aria-controls={`${questionPanelId}-panel`}
                  tabIndex={activeQuestionTab === tab.id ? 0 : -1}
                  onKeyDown={(event) => handleQuestionTabKeyDown(event, index, questionPanelId, (nextTab) => {
                    setActiveQuestionTab(nextTab);
                    setCopyState("idle");
                  })}
                  onClick={() => {
                    setActiveQuestionTab(tab.id);
                    setCopyState("idle");
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div id={`${questionPanelId}-panel`} role="tabpanel" aria-labelledby={questionTabId(activeQuestionTab)}>
              {resolvedQuestions.length ? (
                <ol>
                  {resolvedQuestions.map((question) => <li key={question}>{question}</li>)}
                </ol>
              ) : (
                <p className="interview-package__muted">这一类问题还没有生成，先补全岗位或简历证据。</p>
              )}
            </div>
            <button type="button" className="secondary-button interview-package__copy" onClick={copyQuestions} disabled={!resolvedQuestions.length}>
              {copyState === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制本组问题"}
            </button>
            <span className="sr-only" aria-live="polite">{copyState === "copied" ? "问题已复制" : copyState === "failed" ? "当前环境无法复制" : ""}</span>
          </section>

          <section className="interview-package__resume" aria-labelledby="package-resume-title">
            <div className="interview-package__section-heading">
              <div>
                <span>证据来源</span>
                <h3 id="package-resume-title">当前简历</h3>
              </div>
              <FileText size={20} aria-hidden="true" />
            </div>
            {resume ? (
              <button type="button" onClick={onOpenResume || (() => onNavigate?.("builder"))}>
                <UserRoundCheck size={20} aria-hidden="true" />
                <span><strong>{resume.title}</strong><small>{resume.targetRole}</small></span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" onClick={() => onNavigate?.("builder")}>
                <FileText size={20} aria-hidden="true" />
                <span><strong>尚未选择简历</strong><small>打开材料工作区完成准备</small></span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            )}
          </section>

          <section className="interview-package__checklist" aria-labelledby="package-checklist-title">
            <div className="interview-package__section-heading">
              <div>
                <span>准备清单</span>
                <h3 id="package-checklist-title">{completedChecklist}/{checklist.length} 已完成</h3>
              </div>
              <ClipboardCheck size={20} aria-hidden="true" />
            </div>
            <div className="interview-checklist-progress" aria-hidden="true"><span style={{ width: `${completionPercent}%` }} /></div>
            {checklist.length ? (
              <ul>
                {checklist.map((item) => (
                  <li key={item.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={(event) => onToggleChecklist?.(item.id, event.currentTarget.checked)}
                      />
                      <span>
                        <strong>{item.title}</strong>
                        {item.detail ? <small>{item.detail}</small> : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : <p className="interview-package__muted">暂无准备清单。</p>}
          </section>

          <section className="interview-package__guardrail" aria-labelledby="package-guardrail-title">
            <CheckCircle2 size={21} aria-hidden="true" />
            <div>
              <h3 id="package-guardrail-title">面试包只做规则组装</h3>
              <p>所有答案以岗位原文和简历事实为依据。AI 增强属于可选层，不会自动扩写经历。</p>
              <button type="button" onClick={() => onNavigate?.("optimizer")}>
                <Target size={16} aria-hidden="true" />查看岗位分析
              </button>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}



