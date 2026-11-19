export interface BossJobRecord {
  id: string;
  source: "boss";
  source_job_id: string;
  source_url: string;
  company: string;
  title: string;
  location: string;
  salary: string;
  experience: string;
  education: string;
  description: string;
  recruiter_name: string;
  recruiter_title: string;
  tags: string[];
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

export interface BossIntegrationHealth {
  status: string;
  source: "boss";
  count: number;
}

export interface BossJobPage {
  jobs: BossJobRecord[];
  total: number;
  offset: number;
  limit: number;
}

export interface ProviderSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const PROVIDER_SETTINGS_KEY = "jobfit-provider-settings-v1";
const PROVIDER_CONNECTION_TIMEOUT_MS = 60_000;

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  apiKey: "",
  model: "glm-4-flash",
};

export function normalizeServiceUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function isTrustedLocalServiceUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    if (typeof window === "undefined") return true;
    return isTrustedHostname(window.location.hostname);
  }
  try {
    const parsed = new URL(trimmed);
    return ["http:", "https:"].includes(parsed.protocol)
      && !parsed.username
      && !parsed.password
      && !parsed.search
      && !parsed.hash
      && isTrustedHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function isTrustedHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".ts.net") || host.endsWith(".local")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 127
    || parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}
export function resolveBossApiBaseUrl() {
  const configured = import.meta.env.VITE_AGENT_API_URL?.trim();
  if (configured) return normalizeServiceUrl(configured);
  if (typeof window === "undefined") return "";
  if (["5173", "5174"].includes(window.location.port)) return "http://127.0.0.1:18001";
  return window.location.origin;
}

export function normalizeProviderSettings(value: unknown): ProviderSettings {
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  return {
    baseUrl: typeof record.baseUrl === "string" && record.baseUrl.trim()
      ? normalizeServiceUrl(record.baseUrl)
      : DEFAULT_PROVIDER_SETTINGS.baseUrl,
    apiKey: typeof record.apiKey === "string" ? record.apiKey.trim() : "",
    model: typeof record.model === "string" && record.model.trim()
      ? record.model.trim()
      : DEFAULT_PROVIDER_SETTINGS.model,
  };
}

function browserStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadProviderSettings(storage: Pick<Storage, "getItem"> | undefined = browserStorage()) {
  if (!storage) return { ...DEFAULT_PROVIDER_SETTINGS };
  try {
    const value = storage.getItem(PROVIDER_SETTINGS_KEY);
    return value ? normalizeProviderSettings(JSON.parse(value)) : { ...DEFAULT_PROVIDER_SETTINGS };
  } catch {
    return { ...DEFAULT_PROVIDER_SETTINGS };
  }
}

export function saveProviderSettings(settings: ProviderSettings, storage: Pick<Storage, "setItem"> | undefined = browserStorage()) {
  const normalized = normalizeProviderSettings(settings);
  if (!storage) throw new Error("当前环境无法访问浏览器本地存储。");
  storage.setItem(PROVIDER_SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("本机 JobFit 服务响应超时，请检查 Docker 状态。");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}
async function readError(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { detail?: unknown };
    return typeof payload.detail === "string" && payload.detail.trim() ? payload.detail : fallback;
  } catch {
    return fallback;
  }
}

async function requestBossResponse(baseUrl: string, path: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${normalizeServiceUrl(baseUrl)}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new Error("无法连接本机 JobFit 服务，请确认 Docker 服务正在运行。");
  }
  if (!response.ok) throw new Error(await readError(response, "BOSS 接入服务请求失败。"));
  return response;
}

async function requestBoss<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await requestBossResponse(baseUrl, path, init);
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function createBossIntegrationApi(baseUrl = resolveBossApiBaseUrl()) {
  return {
    getHealth() {
      return requestBoss<BossIntegrationHealth>(baseUrl, "/api/boss/health");
    },
    listJobs() {
      return requestBoss<BossJobRecord[]>(baseUrl, "/api/boss/jobs");
    },
    async listJobsPage(limit = 30, offset = 0): Promise<BossJobPage> {
      const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
      const safeOffset = Math.max(0, Math.trunc(offset));
      const response = await requestBossResponse(
        baseUrl,
        `/api/boss/jobs?limit=${safeLimit}&offset=${safeOffset}`,
      );
      const jobs = await response.json() as BossJobRecord[];
      const parsedTotal = Number(response.headers.get("X-Total-Count"));
      return {
        jobs,
        total: Number.isSafeInteger(parsedTotal) && parsedTotal >= 0 ? parsedTotal : jobs.length,
        offset: safeOffset,
        limit: safeLimit,
      };
    },
    deleteJob(id: string) {
      return requestBoss<void>(baseUrl, `/api/boss/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
  };
}

export async function testProviderConnection(
  settings: ProviderSettings,
  serviceBaseUrl = resolveBossApiBaseUrl(),
) {
  const normalized = normalizeProviderSettings(settings);
  if (!normalized.baseUrl || !normalized.apiKey || !normalized.model) {
    throw new Error("请先填写请求地址、API Key 和模型名称。");
  }
  if (!isTrustedLocalServiceUrl(serviceBaseUrl)) {
    throw new Error("为避免密钥外泄，模型配置只能发送到本机、局域网或 Tailscale 私有服务。");
  }
  let response: Response;
  try {
    response = await fetchWithTimeout(`${normalizeServiceUrl(serviceBaseUrl)}/api/provider/test`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-API-Key": normalized.apiKey,
        "X-API-Base-URL": normalized.baseUrl,
        "X-Model": normalized.model,
      },
    }, PROVIDER_CONNECTION_TIMEOUT_MS);
  } catch {
    throw new Error("浏览器无法连接本机 JobFit 服务，请确认 Docker 正在运行。");
  }
  if (!response.ok) throw new Error(await readError(response, `API 测试失败（HTTP ${response.status}）。`));
  return await response.json() as { ok: boolean; model: string; mode: string; latency_ms: number };
}
