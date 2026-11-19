import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDashed,
  FileText,
  ListChecks,
  MapPin,
  Sparkles,
  Target,
  UserRoundCheck,
  Video,
} from "lucide-react";
import type { ResumeVersion, TabId } from "../types";
import "./TodayBoard.css";

export interface TodayBoardTask {
  id: string;
  title: string;
  detail?: string;
  dueAt: string;
  kind: "follow-up" | "resume" | "interview" | "review";
  priority?: "high" | "normal";
  opportunityId?: string;
  completedAt?: string;
}

export interface TodayBoardInterview {
  id: string;
  company: string;
  title: string;
  at: string;
  format: "phone" | "video" | "onsite";
  location?: string;
  opportunityId?: string;
}

export interface TodayBoardOpportunity {
  id: string;
  company: string;
  title: string;
  stageLabel: string;
  nextStep?: string;
}

export interface TodayBoardProps {
  tasks: TodayBoardTask[];
  interviews?: TodayBoardInterview[];
  opportunities?: TodayBoardOpportunity[];
  resume?: Pick<ResumeVersion, "id" | "title" | "targetRole" | "updatedAt"> | null;
  greeting?: string;
  dateLabel?: string;
  onCompleteTask?: (taskId: string) => void;
  onOpenTask?: (task: TodayBoardTask) => void;
  onOpenOpportunity?: (opportunityId: string) => void;
  onOpenInterviewPackage?: (opportunityId: string) => void;
  onNavigate?: (tab: TabId) => void;
}

const TASK_KIND_LABELS: Record<TodayBoardTask["kind"], string> = {
  "follow-up": "跟进",
  resume: "材料",
  interview: "面试",
  review: "复盘",
};

const INTERVIEW_FORMAT_LABELS: Record<TodayBoardInterview["format"], string> = {
  phone: "电话",
  video: "视频",
  onsite: "现场",
};

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value: string) {
  const date = parseDate(value);
  if (!date) return value;
  return date.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function dueLabel(value: string) {
  const date = parseDate(value);
  if (!date) return "时间待确认";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startDue = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayGap = Math.round((startDue - startToday) / 86_400_000);
  if (dayGap < 0) return `逾期 ${Math.abs(dayGap)} 天`;
  if (dayGap === 0) return "今天";
  if (dayGap === 1) return "明天";
  if (dayGap <= 7) return `${dayGap} 天后`;
  return formatDateTime(value);
}

function taskTime(value: string) {
  const date = parseDate(value);
  if (!date) return value;
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function TodayBoard({
  tasks,
  interviews = [],
  opportunities = [],
  resume,
  greeting = "今天也从一个清晰动作开始。",
  dateLabel,
  onCompleteTask,
  onOpenTask,
  onOpenOpportunity,
  onOpenInterviewPackage,
  onNavigate,
}: TodayBoardProps) {
  const openTasks = tasks.filter((task) => !task.completedAt);
  const upcomingInterviews = interviews
    .filter((interview) => {
      const date = parseDate(interview.at);
      return date ? date.getTime() >= Date.now() : true;
    })
    .sort((left, right) => {
      const leftTime = parseDate(left.at)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTime = parseDate(right.at)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });
  const highPriorityCount = openTasks.filter((task) => task.priority === "high" || dueLabel(task.dueAt).startsWith("逾期")).length;
  const resolvedDateLabel = dateLabel || new Date().toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <section className="today-board" aria-labelledby="today-board-title">
      <header className="today-board__hero">
        <div>
          <span className="today-board__eyebrow"><CalendarDays size={16} aria-hidden="true" />{resolvedDateLabel}</span>
          <h2 id="today-board-title">{greeting}</h2>
          <p>先处理时间敏感的动作，再给机会和材料留出稳定推进。</p>
        </div>
        <div className="today-board__hero-action">
          <span>今日焦点</span>
          <strong>{openTasks[0]?.title || "今天没有紧急待办"}</strong>
          {openTasks[0] ? <small>{dueLabel(openTasks[0].dueAt)}</small> : null}
        </div>
      </header>

      <dl className="today-board__metrics" aria-label="今日概览">
        <div>
          <dt><ListChecks size={17} aria-hidden="true" />待办</dt>
          <dd>{openTasks.length}</dd>
          <small>{highPriorityCount ? `${highPriorityCount} 项优先` : "节奏可控"}</small>
        </div>
        <div>
          <dt><Video size={17} aria-hidden="true" />即将面试</dt>
          <dd>{upcomingInterviews.length}</dd>
          <small>{upcomingInterviews[0] ? formatDateTime(upcomingInterviews[0].at) : "暂无安排"}</small>
        </div>
        <div>
          <dt><Target size={17} aria-hidden="true" />推进机会</dt>
          <dd>{opportunities.length}</dd>
          <small>{opportunities[0]?.stageLabel || "等待加入"}</small>
        </div>
      </dl>

      <div className="today-board__layout">
        <section className="today-board__tasks" aria-labelledby="today-tasks-title">
          <div className="today-board__section-heading">
            <div>
              <span>行动队列</span>
              <h3 id="today-tasks-title">今天做什么</h3>
            </div>
            <button type="button" className="ghost-button" onClick={() => onNavigate?.("applications")}>
              全部跟进<ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>

          {openTasks.length ? (
            <ol className="today-task-list">
              {openTasks.map((task, index) => {
                const overdue = dueLabel(task.dueAt).startsWith("逾期");
                return (
                  <li key={task.id} className={overdue || task.priority === "high" ? "is-priority" : ""}>
                    <span className="today-task-list__index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <div className="today-task-list__main">
                      <div className="today-task-list__meta">
                        <span>{TASK_KIND_LABELS[task.kind]}</span>
                        <span className={overdue ? "is-overdue" : ""}>{dueLabel(task.dueAt)} · {taskTime(task.dueAt)}</span>
                      </div>
                      <button type="button" className="today-task-list__title" onClick={() => onOpenTask?.(task)}>
                        {task.title}<ChevronRight size={17} aria-hidden="true" />
                      </button>
                      {task.detail ? <p>{task.detail}</p> : null}
                    </div>
                    {onCompleteTask ? (
                      <button
                        type="button"
                        className="today-task-list__complete"
                        onClick={() => onCompleteTask(task.id)}
                        aria-label={`完成 ${task.title}`}
                      >
                        <Check size={18} aria-hidden="true" />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="today-board__empty" role="status">
              <CircleDashed size={28} aria-hidden="true" />
              <strong>今天的行动队列已清空</strong>
              <span>可以整理一份材料，或者去看看新的机会。</span>
            </div>
          )}
        </section>

        <aside className="today-board__side" aria-label="今日侧栏">
          <section className="today-board__interview-card" aria-labelledby="today-interview-title">
            <div className="today-board__section-heading">
              <div>
                <span>面试提醒</span>
                <h3 id="today-interview-title">下一场</h3>
              </div>
              <Sparkles size={19} aria-hidden="true" />
            </div>
            {upcomingInterviews[0] ? (
              <article>
                <span>{formatDateTime(upcomingInterviews[0].at)}</span>
                <h4>{upcomingInterviews[0].company}</h4>
                <p>{upcomingInterviews[0].title}</p>
                <div>
                  {upcomingInterviews[0].format === "onsite" ? <MapPin size={15} aria-hidden="true" /> : <Video size={15} aria-hidden="true" />}
                  <span>{INTERVIEW_FORMAT_LABELS[upcomingInterviews[0].format]}</span>
                  {upcomingInterviews[0].location ? <span>{upcomingInterviews[0].location}</span> : null}
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => upcomingInterviews[0].opportunityId
                    ? onOpenInterviewPackage?.(upcomingInterviews[0].opportunityId)
                    : onNavigate?.("applications")}
                >
                  打开面试包<ArrowRight size={16} aria-hidden="true" />
                </button>
              </article>
            ) : (
              <p className="today-board__muted">暂无即将到来的面试。进入面试阶段的机会会出现在这里。</p>
            )}
          </section>

          <section className="today-board__pipeline-card" aria-labelledby="today-pipeline-title">
            <div className="today-board__section-heading">
              <div>
                <span>在途机会</span>
                <h3 id="today-pipeline-title">需要继续推进</h3>
              </div>
              <Target size={19} aria-hidden="true" />
            </div>
            {opportunities.length ? (
              <ul>
                {opportunities.slice(0, 4).map((opportunity) => (
                  <li key={opportunity.id}>
                    <button type="button" onClick={() => onOpenOpportunity?.(opportunity.id)}>
                      <span>
                        <strong>{opportunity.company}</strong>
                        <small>{opportunity.title}</small>
                      </span>
                      <span>
                        <em>{opportunity.stageLabel}</em>
                        <small>{opportunity.nextStep || "查看下一步"}</small>
                      </span>
                      <ChevronRight size={17} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="today-board__muted">还没有推进中的机会，从“机会”加入第一条记录。</p>
            )}
          </section>

          <section className="today-board__resume-card" aria-labelledby="today-resume-title">
            <div className="today-board__section-heading">
              <div>
                <span>材料状态</span>
                <h3 id="today-resume-title">当前简历</h3>
              </div>
              <FileText size={19} aria-hidden="true" />
            </div>
            {resume ? (
              <button type="button" onClick={() => onNavigate?.("builder")}>
                <UserRoundCheck size={19} aria-hidden="true" />
                <span>
                  <strong>{resume.title}</strong>
                  <small>{resume.targetRole} · 更新于 {formatDateTime(resume.updatedAt)}</small>
                </span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" onClick={() => onNavigate?.("builder")}>
                <FileText size={19} aria-hidden="true" />
                <span><strong>还没有可用简历</strong><small>创建或导入第一份材料</small></span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
