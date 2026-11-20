import type {
  ApplicationNextAction,
  ApplicationNextActionKind,
  ApplicationRecord,
  OpportunityRecord,
  OpportunitySource,
  OpportunityStage,
} from "./types";

export const APPROVED_OPPORTUNITY_STAGES = [
  "new",
  "saved",
  "tailoring",
  "applied",
  "communicating",
  "interviewing",
  "offer",
  "unsuitable",
  "closed",
] as const satisfies readonly OpportunityStage[];

export const OPPORTUNITY_STAGE_LABELS: Readonly<Record<OpportunityStage, string>> = {
  new: "待筛选",
  saved: "值得投",
  tailoring: "待定制",
  applied: "已投递",
  communicating: "已沟通",
  interviewing: "约面试",
  offer: "Offer",
  unsuitable: "主动不合适",
  closed: "招聘方关闭/婉拒",
};

const ACTIVE_OPPORTUNITY_STAGES = new Set<OpportunityStage>([
  "new",
  "saved",
  "tailoring",
  "applied",
  "communicating",
  "interviewing",
  "offer",
]);

const STAGE_LABEL_TO_STAGE = new Map<string, OpportunityStage>([
  ...APPROVED_OPPORTUNITY_STAGES.map((stage) => [stage, stage] as const),
  ["待筛选", "new"],
  ["值得投", "saved"],
  ["待定制", "tailoring"],
  ["已投递", "applied"],
  ["已沟通", "communicating"],
  ["约面试", "interviewing"],
  ["Offer", "offer"],
  ["主动不合适", "unsuitable"],
  ["招聘方关闭/婉拒", "closed"],
]);

const LEGACY_STAGE_ALIASES: Readonly<Record<string, OpportunityStage>> = {
  preparing: "tailoring",
  customizing: "tailoring",
  screening: "applied",
  rejected: "closed",
  withdrawn: "closed",
  archived: "closed",
};

export interface DefaultNextActionDefinition {
  kind: ApplicationNextActionKind;
  title: string;
}

export const DEFAULT_NEXT_ACTIONS: Readonly<Partial<Record<OpportunityStage, DefaultNextActionDefinition>>> = {
  new: { kind: "review", title: "判断岗位是否值得投递" },
  saved: { kind: "review", title: "判断岗位是否值得投递" },
  tailoring: { kind: "tailor-resume", title: "按 JD 定制简历" },
  applied: { kind: "follow-up", title: "跟进招聘进展" },
  communicating: { kind: "follow-up", title: "跟进招聘进展" },
  interviewing: { kind: "prepare-interview", title: "准备面试问题与项目案例" },
  offer: { kind: "compare-offer", title: "比较Offer并确认条件" },
};

export interface ManualOpportunityInput {
  company: string;
  title: string;
  description: string;
  location?: string;
  salary?: string;
  url?: string;
  stage?: OpportunityStage | string;
  nextAction?: string;
  nextActionAt?: string;
  channel?: string;
  contact?: string;
  notes?: string;
  applicationId?: string;
  resumeId?: string;
}

export interface OpportunityCreateOptions {
  now?: string | Date;
}

export interface StableOpportunityIdentityInput {
  source?: OpportunitySource | string;
  sourceJobId?: string;
  company?: string;
  title?: string;
  location?: string;
  url?: string;
  job?: {
    company?: string;
    title?: string;
    location?: string;
  };
  sourceUrl?: string;
}

export interface OpportunityCompanyBlacklistState {
  companyKey: string;
  blacklistedAt: string;
  blacklistReason: string;
  sourceOpportunityId: string;
}

export interface OpportunityUpsertOptions {
  now?: string | Date;
}

export interface OpportunityBlacklistOptions {
  now?: string | Date;
  reason?: string;
}

export interface OpportunityCsvPreviewError {
  row: number;
  field?: string;
  code:
    | "csv-format"
    | "missing-header"
    | "required"
    | "stage"
    | "url"
    | "datetime"
    | "batch-limit"
    | "no-data";
  message: string;
}

export interface OpportunitySimilarityHint {
  opportunityId: string;
  reasons: Array<"same-url" | "same-company-title" | "same-company-location-title">;
  message: string;
}

export interface OpportunityCsvPreviewRow {
  index: number;
  line: number;
  values: Record<string, string>;
  record?: OpportunityRecord;
  errors: OpportunityCsvPreviewError[];
  similarityHints: OpportunitySimilarityHint[];
}

export interface OpportunityCsvPreview {
  rows: OpportunityCsvPreviewRow[];
  records: OpportunityRecord[];
  globalErrors: OpportunityCsvPreviewError[];
  ignoredBlankRows: number;
  canImport: boolean;
}

export interface OpportunityFunnelStats {
  total: number;
  activeCount: number;
  closedCount: number;
  interviewing: number;
  dueCount: number;
  counts: Record<OpportunityStage, number>;
  stageCounts: Record<OpportunityStage, number>;
}

export interface OpportunityTaskItem {
  opportunity: OpportunityRecord;
  application?: ApplicationRecord;
  action: ApplicationNextAction;
  dueAt: string;
  daysAhead: number;
}

export interface OpportunityTaskGroups {
  overdue: OpportunityTaskItem[];
  today: OpportunityTaskItem[];
  future: OpportunityTaskItem[];
  upcoming: OpportunityTaskItem[];
  next7Days: OpportunityTaskItem[];
}

export type InterviewPackageQuestions = {
  technical: string[];
  project: string[];
  behavioral: string[];
};

export interface RuleInterviewPackage {
  opportunityId: string;
  company: string;
  title: string;
  generatedAt: string;
  preparationChecklist: string[];
  likelyQuestions: InterviewPackageQuestions;
  projectStories: string[];
  questionsToAsk: string[];
  riskReminders: string[];
}

export interface InterviewPackageOptions {
  application?: ApplicationRecord;
  now?: string | Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizedIdentityText(value: unknown): string {
  return cleanText(value).normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
}

function dateValue(value: string | Date | undefined, fallback = new Date()): Date {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : new Date(value.getTime());
  }
  if (typeof value === "string") {
    const parsed = parseOpportunityDateTime(value);
    if (parsed) return parsed;
  }
  return fallback;
}

function isoDate(value: string | Date | undefined, fallback = new Date()): string {
  return dateValue(value, fallback).toISOString();
}

export function isOpportunityStage(value: unknown): value is OpportunityStage {
  return typeof value === "string" && (APPROVED_OPPORTUNITY_STAGES as readonly string[]).includes(value);
}

function stageFromUnknown(value: unknown, fallback: OpportunityStage = "new"): OpportunityStage {
  const raw = cleanText(value);
  const direct = STAGE_LABEL_TO_STAGE.get(raw) ?? STAGE_LABEL_TO_STAGE.get(raw.toLowerCase());
  if (direct) return direct;
  return LEGACY_STAGE_ALIASES[raw.toLowerCase()] ?? fallback;
}

function sourceFromUnknown(value: unknown): OpportunitySource {
  const raw = cleanText(value);
  return raw === "workspace" || raw === "boss" || raw === "manual" || raw === "csv" ? raw : "manual";
}

export function parseOpportunityDateTime(value: string): Date | null {
  const raw = value.trim();
  if (!raw) return null;

  const localMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(raw);
  if (localMatch) {
    const year = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const day = Number(localMatch[3]);
    const hour = Number(localMatch[4]);
    const minute = Number(localMatch[5]);
    const second = Number(localMatch[6] ?? 0);
    const millisecond = Number((localMatch[7] ?? "").padEnd(3, "0") || 0);
    const parsed = new Date(year, month - 1, day, hour, minute, second, millisecond);
    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day ||
      parsed.getHours() !== hour ||
      parsed.getMinutes() !== minute ||
      parsed.getSeconds() !== second
    ) {
      return null;
    }
    return parsed;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|[+-](\d{2}):(\d{2}))$/i.exec(raw);
  if (!isoMatch) return null;
  const year = Number(isoMatch[1]);
  const month = Number(isoMatch[2]);
  const day = Number(isoMatch[3]);
  const hour = Number(isoMatch[4]);
  const minute = Number(isoMatch[5]);
  const second = Number(isoMatch[6] ?? 0);
  const offsetHour = Number(isoMatch[8] ?? 0);
  const offsetMinute = Number(isoMatch[9] ?? 0);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) return null;
  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function normalizedDateTime(value: unknown): string {
  const raw = cleanText(value);
  const parsed = raw ? parseOpportunityDateTime(raw) : null;
  return parsed ? parsed.toISOString() : "";
}

export function normalizeOpportunityUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    if (parsed.username || parsed.password) return "";
    parsed.hash = "";
    const trackingKeys = [...parsed.searchParams.keys()].filter((key) => {
      const normalized = key.toLowerCase();
      return normalized.startsWith("utm_") || normalized === "from" || normalized === "spm";
    });
    trackingKeys.forEach((key) => parsed.searchParams.delete(key));
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    return "";
  }
}

function validateOpportunityUrl(value: string): boolean {
  return !value.trim() || Boolean(normalizeOpportunityUrl(value));
}

function stableIdentityParts(source: OpportunitySource | string, input: StableOpportunityIdentityInput) {
  const job = input.job ?? {};
  const company = normalizedIdentityText(input.company ?? job.company);
  const title = normalizedIdentityText(input.title ?? job.title);
  const location = normalizedIdentityText(input.location ?? job.location);
  const urlRaw = cleanText(input.url ?? input.sourceUrl ?? "");
  const url = urlRaw ? normalizeOpportunityUrl(urlRaw) || normalizedIdentityText(urlRaw) : "";
  return [normalizedIdentityText(source), company, title, location, url].join("\u001f");
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createOpportunityStableId(
  source: OpportunitySource | string,
  input: StableOpportunityIdentityInput,
): string {
  return `opportunity-${fnv1a(stableIdentityParts(source, input))}`;
}

export function createOpportunitySourceKey(
  record: Pick<OpportunityRecord, "source" | "sourceJobId" | "sourceUrl" | "job">,
): string;
export function createOpportunitySourceKey(
  source: OpportunitySource | string,
  input?: StableOpportunityIdentityInput,
): string;
export function createOpportunitySourceKey(
  sourceOrRecord: OpportunitySource | string | Pick<OpportunityRecord, "source" | "sourceJobId" | "sourceUrl" | "job">,
  input: StableOpportunityIdentityInput = {},
): string {
  const record = typeof sourceOrRecord === "string" ? undefined : sourceOrRecord;
  const source = normalizedIdentityText(record?.source ?? input.source ?? (typeof sourceOrRecord === "string" ? sourceOrRecord : ""));
  const job = record?.job ?? input.job ?? {};
  const sourceUrlRaw = cleanText(record?.sourceUrl ?? input.sourceUrl ?? input.url);
  const sourceUrl = sourceUrlRaw ? normalizeOpportunityUrl(sourceUrlRaw) || normalizedIdentityText(sourceUrlRaw) : "";
  if (sourceUrl) return `source-url:${fnv1a(sourceUrl)}`;

  const sourceJobId = normalizedIdentityText(record?.sourceJobId ?? input.sourceJobId);
  if (sourceJobId) return `source-job:${fnv1a(`${source}\u001f${sourceJobId}`)}`;

  const fallback = [
    source || "unknown",
    normalizedIdentityText(input.company ?? job.company),
    normalizedIdentityText(input.title ?? job.title),
    normalizedIdentityText(input.location ?? job.location),
  ].join("\u001f");
  return `job-identity:${fnv1a(fallback)}`;
}

function actionKindFromText(value: string, stage: OpportunityStage): ApplicationNextActionKind {
  const raw = normalizedIdentityText(value);
  if (raw === "compare-offer" || raw.includes("offer") || raw.includes("比较")) return "compare-offer";
  if (raw === "tailor-resume" || raw.includes("定制") || raw.includes("简历") || raw.includes("tailor")) return "tailor-resume";
  if (raw === "prepare-interview" || raw.includes("面试") || raw.includes("interview")) return "prepare-interview";
  if (raw === "follow-up" || raw.includes("跟进") || raw.includes("沟通") || raw.includes("follow")) return "follow-up";
  if (raw === "review" || raw.includes("判断") || raw.includes("复盘") || raw.includes("review")) return "review";
  return DEFAULT_NEXT_ACTIONS[stage]?.kind ?? "review";
}

export function getDefaultNextActionDefinition(stage: OpportunityStage): DefaultNextActionDefinition | undefined {
  return DEFAULT_NEXT_ACTIONS[stage];
}

export function createDefaultNextAction(
  stage: OpportunityStage,
  dueAt = "",
  now: string | Date = new Date(),
): ApplicationNextAction | undefined {
  const definition = getDefaultNextActionDefinition(stage);
  if (!definition) return undefined;
  const createdAt = isoDate(now);
  return {
    id: `action-${fnv1a(`${stage}|${definition.kind}|${definition.title}`)}`,
    kind: definition.kind,
    title: definition.title,
    dueAt: normalizedDateTime(dueAt) || isoDate(now),
    createdAt,
  };
}

function createNextAction(
  stage: OpportunityStage,
  opportunityId: string,
  nextActionTitle: string,
  nextActionAt: string,
  createdAt: string,
): ApplicationNextAction | undefined {
  const defaultDefinition = getDefaultNextActionDefinition(stage);
  const title = cleanText(nextActionTitle) || defaultDefinition?.title;
  if (!title) return undefined;
  const kind = actionKindFromText(nextActionTitle, stage);
  return {
    id: `action-${fnv1a(`${opportunityId}|${kind}|${normalizedIdentityText(title)}`)}`,
    kind,
    title,
    dueAt: normalizedDateTime(nextActionAt) || createdAt,
    createdAt,
  };
}

export function createManualOpportunity(
  input: ManualOpportunityInput,
  options: OpportunityCreateOptions = {},
): OpportunityRecord {
  const now = isoDate(options.now);
  const stage = stageFromUnknown(input.stage);
  const job = {
    company: cleanText(input.company),
    title: cleanText(input.title),
    description: cleanText(input.description),
    location: cleanText(input.location) || undefined,
    salary: cleanText(input.salary) || undefined,
  };
  const sourceUrl = normalizeOpportunityUrl(input.url ?? "");
  const id = createOpportunityStableId("manual", { job, sourceUrl });
  const nextAction = createNextAction(stage, id, input.nextAction ?? "", input.nextActionAt ?? "", now);

  return {
    id,
    stage,
    job,
    source: "manual",
    sourceUrl: sourceUrl || undefined,
    sourceKey: createOpportunitySourceKey("manual", { job, sourceUrl }),
    applicationId: cleanText(input.applicationId) || undefined,
    resumeId: cleanText(input.resumeId) || undefined,
    channel: cleanText(input.channel),
    contact: cleanText(input.contact),
    notes: cleanText(input.notes),
    createdAt: now,
    updatedAt: now,
    stageChangedAt: now,
    nextAction,
  };
}

function normalizeAction(
  value: unknown,
  stage: OpportunityStage,
  opportunityId: string,
  fallbackCreatedAt: string,
): ApplicationNextAction | undefined {
  if (!isRecord(value)) return undefined;
  const kindRaw = cleanText(value.kind) as ApplicationNextActionKind;
  const defaultDefinition = getDefaultNextActionDefinition(stage);
  const kind =
    kindRaw === "review" ||
    kindRaw === "tailor-resume" ||
    kindRaw === "follow-up" ||
    kindRaw === "prepare-interview" ||
    kindRaw === "compare-offer"
      ? kindRaw
      : defaultDefinition?.kind ?? "review";
  const title = cleanText(value.title) || defaultDefinition?.title || "复盘机会进展";
  const rawCreatedAt = cleanText(value.createdAt);
  const createdAt = rawCreatedAt ? isoDate(rawCreatedAt, new Date(fallbackCreatedAt)) : fallbackCreatedAt;
  const completedAt = normalizedDateTime(value.completedAt);
  return {
    id: cleanText(value.id) || `action-${fnv1a(`${opportunityId}|${kind}|${normalizedIdentityText(title)}`)}`,
    kind,
    title,
    dueAt: normalizedDateTime(value.dueAt),
    ...(completedAt ? { completedAt } : {}),
    createdAt,
  };
}

export interface NormalizeOpportunityOptions {
  now?: string | Date;
}

export function normalizeOpportunityRecord(
  value: unknown,
  options: NormalizeOpportunityOptions = {},
): OpportunityRecord | null {
  if (!isRecord(value)) return null;
  const jobRecord = isRecord(value.job) ? value.job : {};
  const company = cleanText(jobRecord.company);
  const title = cleanText(jobRecord.title);
  if (!company || !title) return null;

  const now = isoDate(options.now);
  const stage = stageFromUnknown(value.stage ?? value.status);
  const source = sourceFromUnknown(value.source);
  const sourceUrl = normalizeOpportunityUrl(cleanText(value.sourceUrl ?? value.url));
  const createdAtRaw = cleanText(value.createdAt);
  const updatedAtRaw = cleanText(value.updatedAt);
  const updatedAt = updatedAtRaw ? isoDate(updatedAtRaw, new Date(createdAtRaw || now)) : now;
  const createdAt = createdAtRaw ? isoDate(createdAtRaw, new Date(updatedAt)) : updatedAt;
  const job = {
    company,
    title,
    description: cleanText(jobRecord.description),
    location: cleanText(jobRecord.location) || undefined,
    salary: cleanText(jobRecord.salary) || undefined,
  };
  const sourceJobId = cleanText(value.sourceJobId) || undefined;
  const existingSourceKey = cleanText(value.sourceKey);
  const sourceKey = (existingSourceKey.length >= 8 ? existingSourceKey : createOpportunitySourceKey(source, {
    sourceJobId,
    job,
    sourceUrl,
  })).slice(0, 256);
  const fallbackId = createOpportunityStableId(source, { job, sourceUrl });
  const id = cleanText(value.id) || fallbackId;
  const nextAction = normalizeAction(value.nextAction, stage, id, updatedAt);
  const stageChangedAt = normalizedDateTime(value.stageChangedAt) || updatedAt;

  return {
    id,
    stage,
    job,
    source,
    sourceJobId,
    sourceUrl: sourceUrl || undefined,
    sourceKey,
    blacklistedAt: normalizedDateTime(value.blacklistedAt) || undefined,
    blacklistReason: cleanText(value.blacklistReason).slice(0, 1000) || undefined,
    applicationId: cleanText(value.applicationId) || undefined,
    resumeId: cleanText(value.resumeId) || undefined,
    channel: cleanText(value.channel),
    contact: cleanText(value.contact),
    notes: cleanText(value.notes),
    createdAt,
    updatedAt,
    stageChangedAt,
    ...(nextAction ? { nextAction } : {}),
  };
}

interface CsvRawRow {
  line: number;
  cells: string[];
}

function detectCsvDelimiter(rawText: string): string {
  const firstLine = rawText.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", "\t", ";"];
  return candidates.reduce((best, candidate) => {
    const count = firstLine.split(candidate).length - 1;
    const bestCount = firstLine.split(best).length - 1;
    return count > bestCount ? candidate : best;
  }, ",");
}

function parseCsvMatrix(rawText: string): {
  rows: CsvRawRow[];
  ignoredBlankRows: number;
  error?: string;
} {
  const delimiter = detectCsvDelimiter(rawText);
  const rows: CsvRawRow[] = [];
  let ignoredBlankRows = 0;
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowStartLine = 1;

  function finishRow() {
    cells.push(cell.trim());
    if (cells.some((value) => value.trim())) {
      if (rows.length === 0 && cells[0]) cells[0] = cells[0].replace(/^\uFEFF/, "");
      rows.push({ line: rowStartLine, cells: cells.map((value) => value.trim()) });
    } else {
      ignoredBlankRows += 1;
    }
    cells = [];
    cell = "";
    rowStartLine = line + 1;
  }

  for (let index = 0; index < rawText.length; index += 1) {
    const character = rawText[index];
    if (character === '"') {
      if (quoted && rawText[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && rawText[index + 1] === "\n") index += 1;
      finishRow();
      line += 1;
      rowStartLine = line;
      continue;
    }
    if (character === "\n") line += 1;
    cell += character;
  }

  if (quoted) {
    return { rows: [], ignoredBlankRows, error: "CSV 存在未闭合的双引号。" };
  }

  if (cell || cells.length) finishRow();
  return { rows, ignoredBlankRows };
}

const CSV_HEADER_ALIASES = {
  company: ["company", "公司"],
  title: ["title", "岗位"],
  description: ["description", "jd"],
  location: ["location", "地点"],
  salary: ["salary", "薪资"],
  url: ["url", "链接"],
  stage: ["stage", "状态"],
  nextAction: ["nextaction", "下一步"],
  nextActionAt: ["nextactionat", "下一步时间"],
  channel: ["channel", "渠道"],
  contact: ["contact", "联系人"],
  notes: ["notes", "备注"],
} as const;

type CsvField = keyof typeof CSV_HEADER_ALIASES;

function headerIndex(headers: string[], field: CsvField): number {
  const aliases = CSV_HEADER_ALIASES[field];
  return headers.findIndex((header) => aliases.some((alias) => header.trim().toLowerCase() === alias.toLowerCase()));
}

export interface ParseOpportunityCsvOptions {
  now?: string | Date;
  existingOpportunities?: OpportunityRecord[];
}

export function parseOpportunityCsv(
  rawText: string,
  options: ParseOpportunityCsvOptions = {},
): OpportunityCsvPreview {
  const parsed = parseCsvMatrix(rawText);
  if (parsed.error) {
    return {
      rows: [],
      records: [],
      globalErrors: [{ row: 0, code: "csv-format", message: parsed.error }],
      ignoredBlankRows: parsed.ignoredBlankRows,
      canImport: false,
    };
  }
  if (!parsed.rows.length) {
    return {
      rows: [],
      records: [],
      globalErrors: [{ row: 0, code: "no-data", message: "没有识别到可预览的 CSV 数据行。" }],
      ignoredBlankRows: parsed.ignoredBlankRows,
      canImport: false,
    };
  }

  const headers = parsed.rows[0].cells.map((header) => header.trim().toLowerCase());
  const requiredFields: CsvField[] = ["company", "title", "description"];
  const indexes = Object.fromEntries(
    (Object.keys(CSV_HEADER_ALIASES) as CsvField[]).map((field) => [field, headerIndex(headers, field)]),
  ) as Record<CsvField, number>;
  const globalErrors: OpportunityCsvPreviewError[] = requiredFields
    .filter((field) => indexes[field] < 0)
    .map((field) => ({
      row: 0,
      field,
      code: "missing-header",
      message: `CSV 表头缺少必填列 ${field}（${CSV_HEADER_ALIASES[field].join("/")}）。`,
    }));

  const dataRows = parsed.rows.slice(1);
  if (dataRows.length === 0) {
    globalErrors.push({ row: 0, code: "no-data", message: "CSV 没有可预览的数据行。" });
  }
  if (dataRows.length > 50) {
    globalErrors.push({
      row: 0,
      code: "batch-limit",
      message: `单批最多导入 50 行，当前有 ${dataRows.length} 行。`,
    });
  }

  const now = isoDate(options.now);
  const existing = [...(options.existingOpportunities ?? [])];
  const rows = dataRows.map((rawRow, rowIndex): OpportunityCsvPreviewRow => {
    const values = Object.fromEntries(
      (Object.keys(CSV_HEADER_ALIASES) as CsvField[]).map((field) => [
        field,
        indexes[field] >= 0 ? rawRow.cells[indexes[field]] ?? "" : "",
      ]),
    ) as Record<CsvField, string>;
    const errors: OpportunityCsvPreviewError[] = [];
    const requiredKeys: CsvField[] = ["company", "title", "description"];
    requiredKeys.forEach((field) => {
      if (!values[field].trim()) {
        errors.push({
          row: rawRow.line,
          field,
          code: "required",
          message: `${CSV_HEADER_ALIASES[field][0]} 不能为空。`,
        });
      }
    });

    const rawStage = values.stage.trim();
    const stage = stageFromUnknown(rawStage || "new");
    if (rawStage && !STAGE_LABEL_TO_STAGE.has(rawStage) && !STAGE_LABEL_TO_STAGE.has(rawStage.toLowerCase())) {
      errors.push({ row: rawRow.line, field: "stage", code: "stage", message: "stage 仅允许九种已批准状态。" });
    }
    if (values.url && !validateOpportunityUrl(values.url)) {
      errors.push({
        row: rawRow.line,
        field: "url",
        code: "url",
        message: "链接必须是有效的 http(s) URL，且不能包含用户名或密码。",
      });
    }
    if (values.nextActionAt && !parseOpportunityDateTime(values.nextActionAt)) {
      errors.push({
        row: rawRow.line,
        field: "nextActionAt",
        code: "datetime",
        message: "下一步时间无法解析，请使用 datetime-local 格式。",
      });
    }

    const id = createOpportunityStableId("csv", {
      company: values.company,
      title: values.title,
      location: values.location,
      url: values.url,
    });
    const normalized = errors.length === 0
      ? normalizeOpportunityRecord({
          id,
          stage,
          job: {
            company: values.company,
            title: values.title,
            description: values.description,
            location: values.location,
            salary: values.salary,
          },
          source: "csv",
          sourceUrl: values.url,
          channel: values.channel,
          contact: values.contact,
          notes: values.notes,
          nextAction: values.nextAction || values.nextActionAt
            ? {
                id: "",
                title: values.nextAction,
                kind: actionKindFromText(values.nextAction, stage),
                dueAt: values.nextActionAt,
                createdAt: now,
              }
            : undefined,
          createdAt: now,
          updatedAt: now,
          stageChangedAt: now,
        }, { now })
      : null;

    if (normalized) {
      normalized.id = id;
      normalized.nextAction = createNextAction(stage, id, values.nextAction, values.nextActionAt, now);
    }

    const similarityHints = normalized ? findSimilarOpportunities(normalized, existing) : [];
    if (normalized) existing.push(normalized);

    return {
      index: rowIndex + 1,
      line: rawRow.line,
      values,
      ...(normalized ? { record: normalized } : {}),
      errors,
      similarityHints,
    };
  });

  const records = rows.flatMap((row) => (row.record ? [row.record] : []));
  return {
    rows,
    records,
    globalErrors,
    ignoredBlankRows: parsed.ignoredBlankRows,
    canImport:
      globalErrors.length === 0 &&
      records.length === rows.length &&
      rows.length > 0 &&
      rows.every((row) => row.errors.length === 0),
  };
}

function normalizedJobKey(record: OpportunityRecord) {
  return `${normalizedIdentityText(record.job.company)}\u001f${normalizedIdentityText(record.job.title)}`;
}

function normalizedLocation(record: OpportunityRecord) {
  return normalizedIdentityText(record.job.location);
}

export function findSimilarOpportunities(
  candidate: OpportunityRecord,
  existing: OpportunityRecord[],
): OpportunitySimilarityHint[] {
  const candidateUrl = candidate.sourceUrl ? normalizeOpportunityUrl(candidate.sourceUrl) : "";
  const candidateJob = normalizedJobKey(candidate);
  const candidateLocation = normalizedLocation(candidate);
  return existing.flatMap((record) => {
    if (record === candidate) return [];
    const reasons: OpportunitySimilarityHint["reasons"] = [];
    const existingUrl = record.sourceUrl ? normalizeOpportunityUrl(record.sourceUrl) : "";
    if (candidateUrl && existingUrl && candidateUrl === existingUrl) reasons.push("same-url");
    if (candidateJob === normalizedJobKey(record)) reasons.push("same-company-title");
    if (
      candidateJob === normalizedJobKey(record) &&
      candidateLocation &&
      candidateLocation === normalizedLocation(record)
    ) {
      reasons.push("same-company-location-title");
    }
    if (!reasons.length) return [];
    const uniqueReasons = [...new Set(reasons)];
    return [{
      opportunityId: record.id,
      reasons: uniqueReasons,
      message: uniqueReasons.includes("same-url")
        ? "发现相同链接的疑似重复岗位，请确认后决定是否继续导入。"
        : "发现公司与岗位名称相同的机会，请确认是否为同一岗位。",
    }];
  });
}

function normalizedRecordUrl(record: OpportunityRecord): string {
  return record.sourceUrl ? normalizeOpportunityUrl(record.sourceUrl) : "";
}

function normalizedRecordSourceJobId(record: OpportunityRecord): string {
  return normalizedIdentityText(record.sourceJobId);
}

function recordsRepresentSameOpportunity(left: OpportunityRecord, right: OpportunityRecord): boolean {
  const leftKey = cleanText(left.sourceKey);
  const rightKey = cleanText(right.sourceKey);
  const leftStrongKey = leftKey && !leftKey.startsWith('job-identity:');
  const rightStrongKey = rightKey && !rightKey.startsWith('job-identity:');
  if (leftStrongKey && rightStrongKey && leftKey === rightKey) return true;

  const leftUrl = normalizedRecordUrl(left);
  const rightUrl = normalizedRecordUrl(right);
  if (leftUrl && rightUrl && leftUrl === rightUrl) return true;

  const leftSourceJobId = normalizedRecordSourceJobId(left);
  const rightSourceJobId = normalizedRecordSourceJobId(right);
  if (
    leftSourceJobId &&
    rightSourceJobId &&
    normalizedIdentityText(left.source) === normalizedIdentityText(right.source) &&
    leftSourceJobId === rightSourceJobId
  ) {
    return true;
  }

  return false;
}

function recordUpdatedTime(record: OpportunityRecord): number {
  const parsed = parseOpportunityDateTime(record.updatedAt);
  return parsed?.getTime() ?? 0;
}

export function mergeOpportunityRecords(
  existing: OpportunityRecord,
  incoming: OpportunityRecord,
  options: OpportunityUpsertOptions = {},
): OpportunityRecord {
  const preferred = recordUpdatedTime(incoming) >= recordUpdatedTime(existing) ? incoming : existing;
  const secondary = preferred === incoming ? existing : incoming;
  const updatedAt = isoDate(
    recordUpdatedTime(preferred) ? preferred.updatedAt : options.now,
    dateValue(existing.updatedAt, new Date(0)),
  );
  const createdAtTime = Math.min(
    parseOpportunityDateTime(existing.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER,
    parseOpportunityDateTime(incoming.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER,
  );
  const createdAt = createdAtTime === Number.MAX_SAFE_INTEGER
    ? existing.createdAt
    : new Date(createdAtTime).toISOString();
  const sourceJobId = cleanText(existing.sourceJobId) || cleanText(incoming.sourceJobId) || undefined;
  const sourceUrlRaw = preferred.sourceUrl || secondary.sourceUrl;
  const sourceUrl = sourceUrlRaw ? normalizeOpportunityUrl(sourceUrlRaw) || undefined : undefined;
  const sourceKey = cleanText(existing.sourceKey) ||
    cleanText(incoming.sourceKey) ||
    createOpportunitySourceKey(preferred.source, { sourceJobId, sourceUrl, job: preferred.job });
  const blacklistCandidates = [existing, incoming]
    .filter((record) => record.blacklistedAt || record.blacklistReason)
    .sort((left, right) => {
      const leftTime = parseOpportunityDateTime(left.blacklistedAt ?? "")?.getTime() ?? 0;
      const rightTime = parseOpportunityDateTime(right.blacklistedAt ?? "")?.getTime() ?? 0;
      return rightTime - leftTime;
    });
  const blacklistSnapshot = blacklistCandidates[0];
  const blacklistedAt = normalizedDateTime(
    blacklistCandidates.find((record) => record.blacklistedAt)?.blacklistedAt,
  ) || undefined;
  const blacklistReason =
    cleanText(blacklistCandidates.find((record) => record.blacklistReason)?.blacklistReason).slice(0, 1000) ||
    cleanText(blacklistSnapshot?.blacklistReason).slice(0, 1000) ||
    undefined;

  return {
    ...existing,
    id: existing.id,
    stage: existing.stage,
    job: {
      company: cleanText(existing.job.company) || cleanText(incoming.job.company),
      title: cleanText(existing.job.title) || cleanText(incoming.job.title),
      description: cleanText(preferred.job.description) || cleanText(secondary.job.description),
      location: cleanText(preferred.job.location) || cleanText(secondary.job.location) || undefined,
      salary: cleanText(preferred.job.salary) || cleanText(secondary.job.salary) || undefined,
    },
    source: preferred.source,
    sourceJobId,
    sourceUrl,
    sourceKey: sourceKey.slice(0, 256),
    blacklistedAt,
    blacklistReason,
    applicationId: cleanText(existing.applicationId) || cleanText(incoming.applicationId) || undefined,
    resumeId: cleanText(existing.resumeId) || cleanText(incoming.resumeId) || undefined,
    channel: cleanText(existing.channel) || cleanText(incoming.channel),
    contact: cleanText(existing.contact) || cleanText(incoming.contact),
    notes: cleanText(existing.notes) || cleanText(incoming.notes),
    createdAt,
    updatedAt,
    stageChangedAt: existing.stageChangedAt || incoming.stageChangedAt || updatedAt,
    nextAction: existing.nextAction ?? incoming.nextAction,
  };
}

export function upsertOpportunity(
  opportunities: OpportunityRecord[],
  incoming: OpportunityRecord,
  options: OpportunityUpsertOptions = {},
): OpportunityRecord[] {
  const existingIndex = opportunities.findIndex((existing) => recordsRepresentSameOpportunity(existing, incoming));
  const sourceKey = cleanText(incoming.sourceKey) ||
    createOpportunitySourceKey(incoming).slice(0, 256);
  const normalizedIncoming = { ...incoming, sourceKey };
  if (existingIndex < 0) return [...opportunities, normalizedIncoming];
  const updated = [...opportunities];
  updated[existingIndex] = mergeOpportunityRecords(updated[existingIndex], normalizedIncoming, options);
  return updated;
}

export function dedupeOpportunities(
  opportunities: OpportunityRecord[],
  options: OpportunityUpsertOptions = {},
): OpportunityRecord[] {
  return opportunities.reduce<OpportunityRecord[]>(
    (unique, opportunity) => upsertOpportunity(unique, opportunity, options),
    [],
  );
}

export function createOpportunityCompanyKey(company: string): string {
  return normalizedIdentityText(company);
}

export function getCompanyBlacklistStates(
  opportunities: OpportunityRecord[],
): Map<string, OpportunityCompanyBlacklistState> {
  const states = new Map<string, OpportunityCompanyBlacklistState>();
  opportunities.forEach((opportunity) => {
    if (!opportunity.blacklistedAt && !opportunity.blacklistReason) return;
    const companyKey = createOpportunityCompanyKey(opportunity.job.company);
    if (!companyKey) return;
    const blacklistedAt = normalizedDateTime(opportunity.blacklistedAt) || cleanText(opportunity.blacklistedAt);
    const blacklistReason = cleanText(opportunity.blacklistReason).slice(0, 1000);
    const current = states.get(companyKey);
    if (!current) {
      states.set(companyKey, {
        companyKey,
        blacklistedAt,
        blacklistReason,
        sourceOpportunityId: opportunity.id,
      });
      return;
    }
    const currentTime = parseOpportunityDateTime(current.blacklistedAt)?.getTime() ?? 0;
    const candidateTime = parseOpportunityDateTime(blacklistedAt)?.getTime() ?? 0;
    states.set(companyKey, {
      companyKey,
      blacklistedAt: candidateTime > currentTime ? blacklistedAt : current.blacklistedAt,
      blacklistReason: blacklistReason || current.blacklistReason,
      sourceOpportunityId:
        candidateTime > currentTime ? opportunity.id : current.sourceOpportunityId,
    });
  });
  return states;
}

export function applyCompanyBlacklist(
  opportunities: OpportunityRecord[],
  selectedOpportunityId: string,
  options: OpportunityBlacklistOptions = {},
): OpportunityRecord[] {
  const selected = opportunities.find((opportunity) => opportunity.id === selectedOpportunityId);
  if (!selected) return [...opportunities];
  const companyKey = createOpportunityCompanyKey(selected.job.company);
  const blacklistedAt = isoDate(options.now);
  const blacklistReason = cleanText(options.reason).slice(0, 1000) || "同公司机会已拉黑";
  return opportunities.map((opportunity) => {
    if (createOpportunityCompanyKey(opportunity.job.company) !== companyKey) return opportunity;
    return {
      ...opportunity,
      blacklistedAt,
      blacklistReason,
      updatedAt: blacklistedAt,
    };
  });
}

export function restoreCompanyBlacklist(
  opportunities: OpportunityRecord[],
  selectedOpportunityId: string,
  options: Pick<OpportunityBlacklistOptions, "now"> = {},
): OpportunityRecord[] {
  const selected = opportunities.find((opportunity) => opportunity.id === selectedOpportunityId);
  if (!selected) return [...opportunities];
  const companyKey = createOpportunityCompanyKey(selected.job.company);
  const updatedAt = isoDate(options.now);
  return opportunities.map((opportunity) => {
    if (createOpportunityCompanyKey(opportunity.job.company) !== companyKey) return opportunity;
    const restored = { ...opportunity, updatedAt };
    delete restored.blacklistedAt;
    delete restored.blacklistReason;
    return restored;
  });
}

export function calculateFunnelStats(
  opportunities: OpportunityRecord[],
  now: string | Date = new Date(),
): OpportunityFunnelStats {
  const counts = Object.fromEntries(
    APPROVED_OPPORTUNITY_STAGES.map((stage) => [stage, 0]),
  ) as Record<OpportunityStage, number>;
  opportunities.forEach((opportunity) => {
    if (isOpportunityStage(opportunity.stage)) counts[opportunity.stage] += 1;
  });
  const activeCount = APPROVED_OPPORTUNITY_STAGES.reduce(
    (total, stage) => total + (ACTIVE_OPPORTUNITY_STAGES.has(stage) ? counts[stage] : 0),
    0,
  );
  const dueCount = groupApplicationTasks(opportunities, [], now).overdue.length;
  return {
    total: opportunities.length,
    activeCount,
    closedCount: counts.unsuitable + counts.closed,
    interviewing: counts.interviewing,
    dueCount,
    counts,
    stageCounts: counts,
  };
}

function localDaySerial(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

function daysAheadBetween(due: Date, now: Date): number {
  return localDaySerial(due) - localDaySerial(now);
}

export function groupApplicationTasks(
  opportunities: OpportunityRecord[],
  applications: ApplicationRecord[] = [],
  now: string | Date = new Date(),
): OpportunityTaskGroups {
  const nowDate = dateValue(now);
  const applicationsById = new Map(applications.map((application) => [application.id, application]));
  const items: OpportunityTaskItem[] = opportunities.flatMap((opportunity) => {
    const action = opportunity.nextAction;
    if (!action || action.completedAt) return [];
    const due = parseOpportunityDateTime(action.dueAt);
    if (!due) return [];
    const application = opportunity.applicationId ? applicationsById.get(opportunity.applicationId) : undefined;
    return [{
      opportunity,
      ...(application ? { application } : {}),
      action,
      dueAt: action.dueAt,
      daysAhead: daysAheadBetween(due, nowDate),
    }];
  });
  const byDueAt = (left: OpportunityTaskItem, right: OpportunityTaskItem) =>
    (parseOpportunityDateTime(left.dueAt)?.getTime() ?? 0) - (parseOpportunityDateTime(right.dueAt)?.getTime() ?? 0);
  const overdue = items.filter((item) => item.daysAhead < 0).sort(byDueAt);
  const today = items.filter((item) => item.daysAhead === 0).sort(byDueAt);
  const future = items.filter((item) => item.daysAhead > 0).sort(byDueAt);
  const next7Days = future.filter((item) => item.daysAhead <= 7);
  return { overdue, today, future, upcoming: future, next7Days };
}

function uniqueKeywords(values: string[], limit: number): string[] {
  return [...new Set(values.map(cleanText).filter(Boolean))].slice(0, limit);
}

export function generateRuleBasedInterviewPackage(
  opportunity: OpportunityRecord,
  options: InterviewPackageOptions = {},
): RuleInterviewPackage {
  const generatedAt = isoDate(options.now);
  const report = options.application?.report;
  const missingKeywords = uniqueKeywords(report?.missingKeywords ?? [], 4);
  const matchedKeywords = uniqueKeywords(report?.matchedKeywords ?? [], 3);
  const technicalQuestions = [
    ...missingKeywords.map((keyword) => `请准备一个能证明你掌握 ${keyword} 的具体案例，并说明关键取舍。`),
    ...matchedKeywords.map((keyword) => `结合岗位要求，说明你如何在项目中使用 ${keyword}，结果如何量化？`),
  ];
  if (!technicalQuestions.length) {
    technicalQuestions.push(`围绕 ${opportunity.job.title} 的核心职责，准备一个能证明相关能力的完整项目案例。`);
  }

  const preparationChecklist = [
    `重新阅读 ${opportunity.job.company} 的 JD，圈出 3 个最高优先级要求。`,
    "准备一段 2 分钟自我介绍，直接连接岗位职责与个人证据。",
    "准备两个按 STAR 结构组织、可量化的项目案例。",
    "为简历中的每项关键数据准备来源、范围和结果说明。",
    options.application
      ? `核对匹配报告：准备解释 ${missingKeywords.length || "所有"} 个能力缺口。`
      : "补充岗位所需技能与项目的对应证据。",
    "确认面试时间、联系人、线上链接或现场地址。",
    "准备 3 个针对团队、业务目标和岗位成功标准的问题。",
  ];

  const projectStories = [
    `最有代表性的项目：说明背景、你承担的角色、使用的 ${matchedKeywords[0] ?? "关键技术/方法"}、量化结果。`,
    "跨团队协作案例：说明冲突、你的决策、沟通方式与最终业务影响。",
    missingKeywords[0]
      ? `能力补强案例：你如何快速学习 ${missingKeywords[0]}，并把学习转化为可验证成果。`
      : "能力补强案例：说明一次快速学习并交付结果的过程。",
  ];

  const questionsToAsk = [
    "这个岗位入职后 3 个月最重要的成功标准是什么？",
    `团队当前最希望 ${opportunity.job.title} 解决哪类问题？`,
    "当前业务或产品最重要的数据指标是什么？",
    "岗位的协作对象、决策边界和成长反馈机制如何？",
  ];

  const riskReminders = [
    ...(missingKeywords.length
      ? [`不要声称未掌握的能力；用学习路径和相邻经验回应：${missingKeywords.join("、")}。`]
      : []),
    "所有结果数字必须能在个人经历、作品或项目记录中找到依据。",
    "回答业务问题时先确认目标，再给方案和验证指标。",
  ];

  return {
    opportunityId: opportunity.id,
    company: opportunity.job.company,
    title: opportunity.job.title,
    generatedAt,
    preparationChecklist,
    likelyQuestions: {
      technical: technicalQuestions,
      project: [
        `请选一个最接近 ${opportunity.job.title} 职责的项目，说明你的具体贡献。`,
        "如果重新做一次，你会调整什么？为什么？",
      ],
      behavioral: [
        "讲一次你在信息不完整时推进工作的经历。",
        "讲一次你和合作方意见不一致并达成结果的经历。",
        "讲一次失败或延期，以及你如何复盘和纠正。",
      ],
    },
    projectStories,
    questionsToAsk,
    riskReminders,
  };
}
