import {
  ArrowRight,
  Download,
  Ban,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  ClipboardPaste,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { OPPORTUNITY_STAGE_LABELS, parseOpportunityCsv } from "../opportunityPipeline";
import type {
  ApplicationNextAction,
  ApplicationRecord,
  OpportunityRecord,
  OpportunitySource,
  OpportunityStage,
  ResumeVersion,
  SavedJobView,
} from "../types";
import "./OpportunityCenter.css";

export type OpportunityNextAction = ApplicationNextAction;

export type OpportunityCenterRecord = OpportunityRecord & {
  application?: Pick<
    ApplicationRecord,
    "id" | "status" | "appliedAt" | "followUpAt" | "interviewAt" | "channel" | "hrContact" | "notes" | "report"
  >;
  resume?: Pick<ResumeVersion, "id" | "title" | "targetRole">;
};

export interface OpportunityHandlers {
  onAdvance: (opportunityId: string, nextStage: OpportunityStage) => void;
  onMarkUnsuitable: (opportunityId: string) => void;
  onUndo: (opportunityId: string) => void;
  onScheduleFollowUp?: (opportunityId: string, dueAt: string) => void;
  onCompleteFollowUp?: (opportunityId: string, actionId: string) => void;
  onPreviewImport?: (kind: "paste" | "csv", rawText: string) => void;
  onConfirmImport?: (kind: "paste" | "csv", rawText: string) => void;
  onOpenInterviewPackage?: (opportunityId: string) => void;
  onAnalyze?: (opportunity: OpportunityCenterRecord) => void;
  onSaveView?: (view: Omit<SavedJobView, "id">) => void;
}

export interface OpportunityCenterProps {
  opportunities: OpportunityCenterRecord[];
  savedViews?: SavedJobView[];
  handlers: OpportunityHandlers;
  title?: string;
  description?: string;
}

type ImportKind = "paste" | "csv";
type StageFilter = OpportunityStage | "all";
type SourceFilter = OpportunitySource | "all";

interface ImportPreviewRow {
  index: number;
  company: string;
  title: string;
  location: string;
  description: string;
  source: string;
  hint?: string;
  error?: string;
}

interface StageDefinition {
  label: string;
  shortLabel: string;
  hint: string;
  tone: "sky" | "blue" | "mint" | "amber" | "rose";
}

const ACTIVE_STAGES: OpportunityStage[] = [
  "new",
  "saved",
  "tailoring",
  "applied",
  "communicating",
  "interviewing",
  "offer",
];

const STAGE_DEFINITIONS: Record<OpportunityStage, StageDefinition> = {
  new: { label: "新发现", shortLabel: "新发现", hint: "先判断是否值得投入", tone: "sky" },
  saved: { label: "已收藏", shortLabel: "已收藏", hint: "保留机会，等待安排", tone: "blue" },
  tailoring: { label: "定制中", shortLabel: "定制中", hint: "正在调整简历与材料", tone: "amber" },
  applied: { label: "已投递", shortLabel: "已投递", hint: "等待招聘方反馈", tone: "blue" },
  communicating: { label: "沟通中", shortLabel: "沟通中", hint: "已和招聘方建立联系", tone: "mint" },
  interviewing: { label: "面试中", shortLabel: "面试中", hint: "进入面试准备与复盘", tone: "amber" },
  offer: { label: "Offer", shortLabel: "Offer", hint: "机会进入最终决策", tone: "mint" },
  unsuitable: { label: "不适合", shortLabel: "不适合", hint: "已退出当前漏斗", tone: "rose" },
  closed: { label: "已关闭", shortLabel: "关闭", hint: "机会已结束归档", tone: "rose" },
};

const SOURCE_LABELS: Record<OpportunitySource, string> = {
  workspace: "工作台",
  boss: "BOSS",
  manual: "手动粘贴",
  csv: "CSV",
};

const ACTION_LABELS: Record<ApplicationNextAction["kind"], string> = {
  "follow-up": "跟进",
  "tailor-resume": "定制简历",
  "prepare-interview": "准备面试",
  review: "复盘",
  "compare-offer": "比较 Offer",
};

function nextStage(stage: OpportunityStage) {
  const index = ACTIVE_STAGES.indexOf(stage);
  return index >= 0 && index < ACTIVE_STAGES.length - 1 ? ACTIVE_STAGES[index + 1] : undefined;
}

function formatDate(value?: string, includeTime = false) {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  });
}

function isOverdue(value: string) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

function detectDelimiter(line: string) {
  const candidates = [",", "\t", ";"];
  return candidates.sort((a, b) => line.split(b).length - line.split(a).length)[0];
}

function headerIndex(headers: string[], names: string[]) {
  return headers.findIndex((header) => names.some((name) => header.trim().toLowerCase() === name));
}

function buildPreview(kind: ImportKind, rawText: string): { rows: ImportPreviewRow[]; error: string } {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { rows: [], error: "先粘贴内容，再生成预览。" };

  let rows: ImportPreviewRow[] = [];
  if (kind === "csv") {
    const preview = parseOpportunityCsv(rawText);
    rows = preview.rows.map((row) => ({
      index: row.index + 1,
      company: row.record?.job.company ?? row.values.company ?? "",
      title: row.record?.job.title ?? row.values.title ?? "",
      location: row.record?.job.location ?? row.values.location ?? "",
      description: row.record?.job.description ?? row.values.description ?? "",
      source: row.record?.source ?? "csv",
      hint: row.similarityHints[0]?.message,
      error: row.errors[0]?.message,
    }));
    const globalError = preview.globalErrors[0]?.message;
    if (!preview.canImport) {
      if (!rows.length) return { rows: [], error: globalError || preview.rows[0]?.errors[0]?.message || "CSV 没有可导入的数据。" };
      return {
        rows: rows.map((row) => ({ ...row, error: row.error ?? globalError })),
        error: globalError ?? "",
      };
    }
    return { rows, error: "" };
  } else {
    rows = lines.map((line, index) => {
      const cells = line.split(/\t|,|;|\||｜/).map((cell) => cell.trim());
      const company = cells[0] ?? "";
      const title = cells[1] ?? "";
      const location = cells[2] ?? "";
      const description = cells.slice(3).join(" ");
      return {
        index: index + 1,
        company,
        title,
        location,
        description,
        source: "手动粘贴",
        error: !company || !title || !description ? "每行需填写公司、岗位和 JD，并用竖线分隔" : undefined,
      };
    });
  }

  if (!rows.length) return { rows: [], error: "没有识别到可预览的数据行。" };
  return { rows, error: "" };
}

function OpportunityCard({
  handlers,
  opportunity,
}: {
  handlers: OpportunityHandlers;
  opportunity: OpportunityCenterRecord;
}) {
  const [followUpDraft, setFollowUpDraft] = useState(
    opportunity.nextAction?.dueAt ? opportunity.nextAction.dueAt.slice(0, 16) : "",
  );
  const stage = STAGE_DEFINITIONS[opportunity.stage];
  const advanceTo = nextStage(opportunity.stage);
  const isExited = opportunity.stage === "unsuitable" || opportunity.stage === "closed";
  const canUndo = opportunity.stage !== "new";
  const actionOverdue = opportunity.nextAction ? isOverdue(opportunity.nextAction.dueAt) : false;

  return (
    <article className="opportunity-card" aria-labelledby={`opportunity-${opportunity.id}-title`}>
      <header className="opportunity-card__header">
        <div>
          <div className="opportunity-card__meta">
            <span className={`opportunity-stage opportunity-stage--${stage.tone}`}>{stage.label}</span>
            <span>{SOURCE_LABELS[opportunity.source]}</span>
            {opportunity.application?.report.score !== undefined ? (
              <span>匹配 {opportunity.application.report.score}%</span>
            ) : null}
          </div>
          <h3 id={`opportunity-${opportunity.id}-title`}>{opportunity.job.title || "未命名岗位"}</h3>
          <p>{opportunity.job.company || "未填写公司"}</p>
        </div>
        {opportunity.sourceUrl ? (
          <a href={opportunity.sourceUrl} target="_blank" rel="noreferrer" className="opportunity-card__source-link">
            查看来源 <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : null}
      </header>

      <div className="opportunity-card__facts">
        <span><BriefcaseBusiness size={15} aria-hidden="true" />{stage.hint}</span>
        <span><CalendarClock size={15} aria-hidden="true" />更新于 {formatDate(opportunity.stageChangedAt || opportunity.updatedAt)}</span>
        {opportunity.resume ? <span><UserRoundCheck size={15} aria-hidden="true" />{opportunity.resume.title}</span> : null}
      </div>

      {opportunity.nextAction ? (
        <section className={`opportunity-card__action ${actionOverdue ? "is-overdue" : ""}`} aria-label="下一动作">
          <div>
            <span>{ACTION_LABELS[opportunity.nextAction.kind]}</span>
            <strong>{opportunity.nextAction.title}</strong>
            <small>{actionOverdue ? "已逾期 · " : ""}{formatDate(opportunity.nextAction.dueAt, true)}</small>
          </div>
          {handlers.onCompleteFollowUp && !opportunity.nextAction.completedAt ? (
            <button
              className="secondary-button opportunity-button opportunity-button--compact"
              type="button"
              onClick={() => handlers.onCompleteFollowUp?.(opportunity.id, opportunity.nextAction!.id)}
            >
              <CheckCircle2 size={16} aria-hidden="true" />完成
            </button>
          ) : opportunity.nextAction.completedAt ? (
            <span className="opportunity-card__completed"><CheckCircle2 size={15} aria-hidden="true" />已完成</span>
          ) : null}
        </section>
      ) : null}

      <div className="opportunity-card__actions">
        {advanceTo ? (
          <button
            className="primary-button opportunity-button"
            type="button"
            onClick={() => handlers.onAdvance(opportunity.id, advanceTo)}
          >
            推进至 {STAGE_DEFINITIONS[advanceTo].label}<ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : null}
        {opportunity.job.description && handlers.onAnalyze ? (
          <button
            className="secondary-button opportunity-button"
            type="button"
            onClick={() => handlers.onAnalyze?.(opportunity)}
          >
            <Search size={16} aria-hidden="true" />用 JD 匹配
          </button>
        ) : null}
        {opportunity.stage === "interviewing" && handlers.onOpenInterviewPackage ? (
          <button
            className="secondary-button opportunity-button"
            type="button"
            onClick={() => handlers.onOpenInterviewPackage?.(opportunity.id)}
          >
            <Sparkles size={16} aria-hidden="true" />面试包
          </button>
        ) : null}
        {!isExited ? (
          <button
            className="ghost-button opportunity-button opportunity-button--danger"
            type="button"
            onClick={() => handlers.onMarkUnsuitable(opportunity.id)}
          >
            <Ban size={16} aria-hidden="true" />不适合
          </button>
        ) : null}
        {canUndo ? (
          <button
            className="ghost-button opportunity-button"
            type="button"
            onClick={() => handlers.onUndo(opportunity.id)}
          >
            <RotateCcw size={16} aria-hidden="true" />撤销状态
          </button>
        ) : null}
      </div>

      {handlers.onScheduleFollowUp ? (
        <details className="opportunity-card__follow-up">
          <summary><CalendarClock size={16} aria-hidden="true" />安排跟进</summary>
          <div>
            <label>
              <span>跟进时间</span>
              <input
                type="datetime-local"
                value={followUpDraft}
                onChange={(event) => setFollowUpDraft(event.currentTarget.value)}
              />
            </label>
            <button
              className="secondary-button opportunity-button"
              type="button"
              disabled={!followUpDraft}
              onClick={() => handlers.onScheduleFollowUp?.(opportunity.id, followUpDraft)}
            >
              保存任务
            </button>
          </div>
        </details>
      ) : null}
    </article>
  );
}

function csvCell(value: unknown) {
  const raw = value === undefined || value === null ? "" : String(value);
  const text = /^[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportOpportunitiesCsv(rows: OpportunityCenterRecord[]) {
  const headers = [
    "company", "title", "stage", "source", "location", "salary", "description",
    "sourceUrl", "nextAction", "nextActionDueAt", "createdAt", "updatedAt",
  ];
  const body = rows.map((item) => [
    item.job.company,
    item.job.title,
    OPPORTUNITY_STAGE_LABELS[item.stage],
    item.source,
    item.job.location ?? "",
    item.job.salary ?? "",
    item.job.description,
    item.sourceUrl ?? "",
    item.nextAction?.title ?? "",
    item.nextAction?.dueAt ?? "",
    item.createdAt,
    item.updatedAt,
  ].map(csvCell).join(","));
  const blob = new Blob([`\ufeff${headers.join(",")}\n${body.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `zhiqi-yunfan-opportunities-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function OpportunityCenter({
  opportunities,
  savedViews = [],
  handlers,
  title = "机会漏斗",
  description = "把发现、投递、沟通和面试放在同一条清晰路径里。",
}: OpportunityCenterProps) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [activeViewId, setActiveViewId] = useState("all");
  const [importKind, setImportKind] = useState<ImportKind>("paste");
  const [importText, setImportText] = useState("");
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [previewError, setPreviewError] = useState("");
  const [viewName, setViewName] = useState("");

  const activeView = savedViews.find((view) => view.id === activeViewId);
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      opportunities.filter((opportunity) => {
        const matchesSearch =
          !normalizedSearch ||
          `${opportunity.job.company} ${opportunity.job.title}`.toLowerCase().includes(normalizedSearch);
        const matchesStage = stageFilter === "all" || opportunity.stage === stageFilter;
        const matchesSource = sourceFilter === "all" || opportunity.source === sourceFilter;
        const matchesView =
          !activeView ||
          (!activeView.stages?.length || activeView.stages.includes(opportunity.stage)) &&
          (!activeView.source || activeView.source === opportunity.source) &&
          (!activeView.query || `${opportunity.job.company} ${opportunity.job.title}`.toLowerCase().includes(activeView.query.toLowerCase()));
        return matchesSearch && matchesStage && matchesSource && matchesView;
      }),
    [activeView, normalizedSearch, opportunities, sourceFilter, stageFilter],
  );

  const stats = useMemo(() => {
    const counts = Object.fromEntries(
      (Object.keys(STAGE_DEFINITIONS) as OpportunityStage[]).map((stage) => [stage, 0]),
    ) as Record<OpportunityStage, number>;
    opportunities.forEach((opportunity) => {
      counts[opportunity.stage] += 1;
    });
    const activeCount = ACTIVE_STAGES.reduce((total, stage) => total + counts[stage], 0);
    const dueCount = opportunities.filter(
      (opportunity) => opportunity.nextAction && !opportunity.nextAction.completedAt && isOverdue(opportunity.nextAction.dueAt),
    ).length;
    const interviewing = opportunities.filter((opportunity) => opportunity.stage === "interviewing").length;
    return { counts, activeCount, dueCount, interviewing };
  }, [opportunities]);

  function applySavedView(viewId: string) {
    setActiveViewId(viewId);
    const view = savedViews.find((item) => item.id === viewId);
    setSearch(view?.query ?? "");
    setStageFilter("all");
    setSourceFilter(view?.source ?? "all");
  }

  function generatePreview() {
    const result = buildPreview(importKind, importText);
    setPreviewRows(result.rows);
    setPreviewError(result.error);
    if (!result.error) handlers.onPreviewImport?.(importKind, importText);
  }

  function clearImport() {
    setImportText("");
    setPreviewRows([]);
    setPreviewError("");
  }

  return (
    <section className="opportunity-center" aria-labelledby="opportunity-center-title">
      <header className="opportunity-center__hero">
        <div>
          <span className="opportunity-center__eyebrow"><Target size={16} aria-hidden="true" />机会工作区</span>
          <h2 id="opportunity-center-title">{title}</h2>
          <p>{description}</p>
        </div>
        <dl className="opportunity-center__summary" aria-label="机会摘要">
          <div><dt>推进中</dt><dd>{stats.activeCount}</dd></div>
          <div className={stats.dueCount ? "is-alert" : ""}><dt>需跟进</dt><dd>{stats.dueCount}</dd></div>
          <div><dt>面试中</dt><dd>{stats.interviewing}</dd></div>
        </dl>
      </header>

      <section className="opportunity-funnel" aria-labelledby="opportunity-funnel-title">
        <div className="opportunity-section-heading">
          <div>
            <span>转化视图</span>
            <h3 id="opportunity-funnel-title">机会漏斗</h3>
          </div>
          <small>按当前状态统计，不适合与关闭不进入漏斗。</small>
        </div>
        <div className="opportunity-funnel__track" role="list" aria-label="各阶段机会数量">
          {ACTIVE_STAGES.map((stage) => {
            const count = stats.counts[stage];
            const max = Math.max(...ACTIVE_STAGES.map((activeStage) => stats.counts[activeStage]), 1);
            return (
              <div key={stage} role="listitem">
                <button
                  type="button"
                  className={stageFilter === stage ? "is-active" : ""}
                  aria-pressed={stageFilter === stage}
                  onClick={() => { setActiveViewId("all"); setStageFilter((current) => current === stage ? "all" : stage); }}
                >
                  <span>{STAGE_DEFINITIONS[stage].shortLabel}</span>
                  <strong>{count}</strong>
                  <i aria-hidden="true"><b style={{ width: `${Math.max(8, (count / max) * 100)}%` }} /></i>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="opportunity-list-panel" aria-labelledby="opportunity-list-title">
        <div className="opportunity-list-panel__toolbar">
          <div>
            <span>机会列表</span>
            <h3 id="opportunity-list-title">{filtered.length} 条结果</h3>
          </div>
          <div className="opportunity-toolbar-actions">
            <button
              className="secondary-button opportunity-button"
              type="button"
              disabled={!filtered.length}
              onClick={() => exportOpportunitiesCsv(filtered)}
            >
              <Download size={16} aria-hidden="true" />导出当前机会
            </button>
          </div>
          <label className="opportunity-search">
            <span className="sr-only">搜索公司与岗位</span>
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              placeholder="搜索公司或岗位"
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setActiveViewId("all");
              }}
            />
            {search ? (
              <button type="button" aria-label="清除搜索" onClick={() => { setSearch(""); setActiveViewId("all"); }}>
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
          </label>
        </div>

        {savedViews.length ? (
          <div className="opportunity-saved-views" aria-label="已保存的筛选视图">
            <span><Filter size={15} aria-hidden="true" />视图</span>
            <button type="button" className={activeViewId === "all" ? "is-active" : ""} onClick={() => applySavedView("all")}>全部</button>
            {savedViews.map((view) => (
              <button
                type="button"
                key={view.id}
                className={activeViewId === view.id ? "is-active" : ""}
                onClick={() => applySavedView(view.id)}
              >
                {view.name}
              </button>
            ))}
          </div>
        ) : null}

        {handlers.onSaveView ? (
          <form
            className="opportunity-save-view"
            onSubmit={(event) => {
              event.preventDefault();
              const name = viewName.trim();
              if (!name || savedViews.length >= 5) return;
              handlers.onSaveView?.({
                name,
                ...(search.trim() ? { query: search.trim() } : {}),
                ...(stageFilter === "all" ? {} : { stages: [stageFilter] }),
                ...(sourceFilter === "all" ? {} : { source: sourceFilter }),
              });
              setViewName("");
            }}
          >
            <label>
              <span>保存当前筛选</span>
              <input
                aria-label="筛选视图名称"
                value={viewName}
                maxLength={32}
                onChange={(event) => setViewName(event.currentTarget.value)}
                placeholder={savedViews.length >= 5 ? "已达 5 个上限" : "例如：本周优先跟进"}
                disabled={savedViews.length >= 5}
              />
            </label>
            <button className="secondary-button opportunity-button" type="submit" disabled={!viewName.trim() || savedViews.length >= 5}>
              保存视图 {savedViews.length}/5
            </button>
          </form>
        ) : null}

        <div className="opportunity-filters">
          <label>
            <span>阶段</span>
            <select value={stageFilter} onChange={(event) => { setActiveViewId("all"); setStageFilter(event.currentTarget.value as StageFilter); }}>
              <option value="all">全部阶段</option>
              {Object.entries(STAGE_DEFINITIONS).map(([value, definition]) => (
                <option value={value} key={value}>{definition.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>来源</span>
            <select value={sourceFilter} onChange={(event) => { setActiveViewId("all"); setSourceFilter(event.currentTarget.value as SourceFilter); }}>
              <option value="all">全部来源</option>
              {Object.entries(SOURCE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <button type="button" className="ghost-button opportunity-button" onClick={() => {
            setSearch("");
            setStageFilter("all");
            setSourceFilter("all");
            setActiveViewId("all");
          }}>
            <RotateCcw size={15} aria-hidden="true" />重置筛选
          </button>
        </div>

        {filtered.length ? (
          <div className="opportunity-card-list">
            {filtered.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} handlers={handlers} />
            ))}
          </div>
        ) : (
          <div className="opportunity-empty" role="status">
            <CircleDashed size={32} aria-hidden="true" />
            <h4>{opportunities.length ? "当前筛选没有结果" : "漏斗还是空的"}</h4>
            <p>{opportunities.length ? "调整阶段、来源或搜索词，查看其他机会。" : "从下方粘贴岗位或预览 CSV，把第一条机会放进来。"}</p>
          </div>
        )}
      </section>

      <details className="opportunity-import">
        <summary>
          <span><ClipboardPaste size={18} aria-hidden="true" />手动粘贴或 CSV 预览</span>
          <ChevronRight size={18} aria-hidden="true" />
        </summary>
        <div className="opportunity-import__body">
          <div className="opportunity-import__intro">
            <div>
              <span>导入入口 V1</span>
              <h3>先预览，再交给上层确认导入</h3>
              <p>组件只负责本地预览；去重、稳定 ID 与最终入库由机会规则层完成。</p>
            </div>
            <div className="opportunity-import__tabs" role="tablist" aria-label="导入方式">
              <button type="button" role="tab" aria-selected={importKind === "paste"} onClick={() => { setImportKind("paste"); setPreviewRows([]); setPreviewError(""); }}>
                <ClipboardPaste size={16} aria-hidden="true" />粘贴
              </button>
              <button type="button" role="tab" aria-selected={importKind === "csv"} onClick={() => { setImportKind("csv"); setPreviewRows([]); setPreviewError(""); }}>
                <FileSpreadsheet size={16} aria-hidden="true" />CSV
              </button>
            </div>
          </div>

          <label className="opportunity-import__field">
            <span>{importKind === "paste" ? "每行一个机会" : "粘贴 CSV 内容"}</span>
            <small>{importKind === "paste" ? "格式：公司 | 岗位 | 城市 | JD；JD 中可正常使用逗号。" : "表头需包含 company、title、description；也可选 location/source。"}</small>
            <textarea
              value={importText}
              onChange={(event) => {
                setImportText(event.currentTarget.value);
                setPreviewRows([]);
                setPreviewError("");
              }}
              placeholder={importKind === "paste" ? "云帆科技 | AI 产品实习生 | 上海 | 负责 Agent 产品与 RAG 验证" : "company,title,description,location\n云帆科技,AI 产品实习生,负责 Agent 产品与 RAG 验证,上海"}
            />
          </label>
          <div className="opportunity-import__actions">
            <button className="secondary-button opportunity-button" type="button" onClick={generatePreview} disabled={!importText.trim()}>
              生成预览
            </button>
            <button className="ghost-button opportunity-button" type="button" onClick={clearImport} disabled={!importText && !previewRows.length}>
              清空
            </button>
            <button
              className="primary-button opportunity-button"
              type="button"
              disabled={!previewRows.length || previewRows.some((row) => row.error) || !handlers.onConfirmImport}
              onClick={() => handlers.onConfirmImport?.(importKind, importText)}
            >
              确认导入 {previewRows.length ? `(${previewRows.length})` : ""}<ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="opportunity-import__preview" aria-live="polite">
            {previewError ? <p className="opportunity-import__error">{previewError}</p> : null}
            {previewRows.length ? (
              <div className="opportunity-preview-table-wrap">
                <table className="opportunity-preview-table">
                  <caption>导入预览，共 {previewRows.length} 行</caption>
                  <thead><tr><th scope="col">#</th><th scope="col">公司</th><th scope="col">岗位</th><th scope="col">城市</th><th scope="col">来源</th><th scope="col">检查</th></tr></thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={row.index} className={row.error ? "has-error" : ""}>
                        <td>{row.index}</td>
                        <td>{row.company || "—"}</td>
                        <td>{row.title || "—"}</td>
                        <td>{row.location || "—"}</td>
                        <td>{row.source}</td>
                        <td>{row.error || row.hint || "可导入"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      </details>
    </section>
  );
}


