import type {
  AgentHealth,
  Analysis,
  AnalysisRequest,
  BatchAnalysisRequest,
  BatchAnalysisResponse,
  BatchJobInput,
  Material,
  MaterialDraft,
  ParsedResume,
} from "./agentTypes";

export class AgentApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AgentApiError";
    this.status = status;
  }
}

export const MAX_BATCH_JOBS = 20;

export interface AgentApiOptions {
  baseUrl?: string;
}

function normalizeBaseUrl(baseUrl?: string) {
  const configuredBaseUrl = baseUrl ?? import.meta.env.VITE_AGENT_API_URL ?? "";
  return configuredBaseUrl.replace(/\/+$/, "");
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === "string" && payload.detail.trim()) {
      return payload.detail;
    }
  } catch {
    // Keep the status-aware fallback when the backend cannot return JSON.
  }
  return fallback;
}

async function requestAgentApi<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, init);
  } catch {
    throw new AgentApiError("无法连接 Agent 后端，请确认 FastAPI 服务正在运行。");
  }

  if (!response.ok) {
    const fallback = response.status >= 500 ? "Agent 后端处理请求失败，请稍后重试。" : "Agent 后端拒绝了本次请求。";
    throw new AgentApiError(await readErrorMessage(response, fallback), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function createAgentApi({ baseUrl }: AgentApiOptions = {}) {
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl);

  async function requestJson<T>(path: string, method: string, body?: unknown) {
    return requestAgentApi<T>(resolvedBaseUrl, path, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  return {
    async getHealth() {
      return requestJson<AgentHealth>("/api/health", "GET");
    },
    async parseResume(file: File) {
      const extension = file.name.toLowerCase().split(".").pop();
      if (!extension || !["pdf", "txt"].includes(extension)) {
        throw new AgentApiError("仅支持上传 PDF 或 TXT 简历文件。");
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new AgentApiError("简历文件不能超过 2MB。");
      }

      const body = new FormData();
      body.append("file", file);
      return requestAgentApi<ParsedResume>(resolvedBaseUrl, "/api/parse/resume", {
        method: "POST",
        headers: { Accept: "application/json" },
        body,
      });
    },
    async listMaterials() {
      return requestJson<Material[]>("/api/materials", "GET");
    },
    async createMaterial(draft: MaterialDraft) {
      return requestJson<Material>("/api/materials", "POST", draft);
    },
    async deleteMaterial(id: string) {
      await requestAgentApi<void>(resolvedBaseUrl, `/api/materials/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
    },
    async analyze(request: AnalysisRequest) {
      return requestJson<Analysis>("/api/analyze", "POST", request);
    },
    async analyzeBatch(request: BatchAnalysisRequest) {
      return requestJson<BatchAnalysisResponse>("/api/batch", "POST", request);
    },
    async exportBatchCsv(request: BatchAnalysisRequest) {
      let response: Response;
      try {
        response = await fetch(`${resolvedBaseUrl}/api/batch/export`, {
          method: "POST",
          headers: {
            Accept: "text/csv",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        });
      } catch {
        throw new AgentApiError("无法连接 Agent 后端，无法导出 CSV。");
      }
      if (!response.ok) {
        throw new AgentApiError(
          await readErrorMessage(response, "CSV 导出失败，请稍后重试。"),
          response.status,
        );
      }
      return response.blob();
    },
    async listHistory() {
      return requestJson<Analysis[]>("/api/history", "GET");
    },
    async getHistory(id: string) {
      return requestJson<Analysis>(`/api/history/${encodeURIComponent(id)}`, "GET");
    },
  };
}

export type AgentApiClient = ReturnType<typeof createAgentApi>;

function normalizeJob(value: unknown, position: number): BatchJobInput {
  if (typeof value !== "object" || value === null) {
    throw new AgentApiError(`第 ${position} 条岗位不是有效对象。`);
  }
  const record = value as Record<string, unknown>;
  const company = typeof record.company === "string" ? record.company.trim() : "";
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const jdText = typeof record.jd_text === "string" ? record.jd_text.trim() : "";
  if (!company || !title || !jdText) {
    throw new AgentApiError(`第 ${position} 条岗位需要完整填写公司、职位和 JD。`);
  }
  return { company, title, jd_text: jdText };
}

export function parseBatchJobs(input: string): BatchJobInput[] {
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    throw new AgentApiError("请先粘贴 JSON 或文本格式的批量岗位。");
  }

  let records: unknown[];
  try {
    const parsed = JSON.parse(trimmedInput) as unknown;
    records = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { jobs?: unknown }).jobs)
        ? (parsed as { jobs: unknown[] }).jobs
        : [];
    if (!records.length) {
      throw new Error("empty");
    }
  } catch {
    records = trimmedInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const columns = line.split(/\t|\|/).map((column) => column.trim());
        if (columns.length !== 3) {
          throw new AgentApiError("文本导入每行需要用“公司 | 职位 | JD”或制表符分隔三列。");
        }
        return { company: columns[0], title: columns[1], jd_text: columns[2] };
      });
  }

  if (records.length > MAX_BATCH_JOBS) {
    throw new AgentApiError(`批量分析一次最多 ${MAX_BATCH_JOBS} 条岗位，当前 ${records.length} 条。`);
  }
  return records.map(normalizeJob);
}

export const agentApi = createAgentApi();
