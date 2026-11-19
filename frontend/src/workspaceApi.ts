import { resolveBossApiBaseUrl } from "./bossIntegration";
import type { ApplicationRecord, CandidateProfile, ResumeVersion } from "./types";

export interface WorkspaceStatePayload {
  version: number;
  exportedAt?: string;
  profile: CandidateProfile;
  resumes: ResumeVersion[];
  applications: ApplicationRecord[];
}

export const WORKSPACE_SYNC_KEY = "jobfit-workspace-sync-v1";

export interface WorkspaceSyncMeta {
  dirty: boolean;
  revision: number | null;
}

type WorkspaceSyncStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function workspaceSyncStorage(): WorkspaceSyncStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadWorkspaceSyncMeta(
  storage: WorkspaceSyncStorage | undefined = workspaceSyncStorage(),
): WorkspaceSyncMeta {
  if (!storage) return { dirty: false, revision: null };
  try {
    const parsed = JSON.parse(storage.getItem(WORKSPACE_SYNC_KEY) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object") return { dirty: false, revision: null };
    const record = parsed as Record<string, unknown>;
    const revision = record.revision === null || typeof record.revision === "number"
      ? record.revision as number | null
      : null;
    const validRevision = revision === null || (Number.isSafeInteger(revision) && revision >= 0);
    return { dirty: record.dirty === true, revision: validRevision ? revision : null };
  } catch {
    return { dirty: false, revision: null };
  }
}

export function markWorkspaceDirty(
  revision: number | null,
  storage: WorkspaceSyncStorage | undefined = workspaceSyncStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(WORKSPACE_SYNC_KEY, JSON.stringify({ dirty: true, revision }));
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

export function markWorkspaceClean(
  revision: number,
  storage: WorkspaceSyncStorage | undefined = workspaceSyncStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(WORKSPACE_SYNC_KEY, JSON.stringify({ dirty: false, revision }));
  } catch {
    // Server sync still succeeded; the next edit will try to persist metadata again.
  }
}

export function clearWorkspaceSyncMeta(
  storage: WorkspaceSyncStorage | undefined = workspaceSyncStorage(),
) {
  try {
    storage?.removeItem(WORKSPACE_SYNC_KEY);
  } catch {
    // Ignore cleanup failures; state reset remains authoritative for this tab.
  }
}

export interface WorkspaceEnvelope {
  state: WorkspaceStatePayload;
  updated_at: string;
  revision: number;
}

export class WorkspaceConflictError extends Error {
  readonly current: WorkspaceEnvelope;

  constructor(current: WorkspaceEnvelope) {
    super("服务器工作区已被另一标签页更新。");
    this.name = "WorkspaceConflictError";
    this.current = current;
  }
}

async function fetchWorkspace(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 4500);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("连接服务器工作区超时。");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}
async function readDetail(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { detail?: unknown };
    return typeof payload.detail === "string" && payload.detail.trim() ? payload.detail : fallback;
  } catch {
    return fallback;
  }
}

export function createWorkspaceApi(baseUrl = resolveBossApiBaseUrl()) {
  const root = baseUrl.replace(/\/+$/, "");
  return {
    async load(): Promise<WorkspaceEnvelope | null> {
      let response: Response;
      try {
        response = await fetchWorkspace(`${root}/api/workspace`, { headers: { Accept: "application/json" } });
      } catch {
        throw new Error("无法连接本机工作区服务。");
      }
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(await readDetail(response, "读取服务器工作区失败。"));
      return await response.json() as WorkspaceEnvelope;
    },
    async save(state: WorkspaceStatePayload, expectedRevision: number | null): Promise<WorkspaceEnvelope> {
      let response: Response;
      try {
        response = await fetchWorkspace(`${root}/api/workspace`, {
          method: "PUT",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ state, expected_revision: expectedRevision }),
        });
      } catch {
        throw new Error("无法连接本机工作区服务。");
      }
      if (response.status === 409) {
        const payload = await response.json() as { current?: WorkspaceEnvelope };
        if (payload.current) throw new WorkspaceConflictError(payload.current);
      }
      if (!response.ok) throw new Error(await readDetail(response, "保存服务器工作区失败。"));
      return await response.json() as WorkspaceEnvelope;
    },
  };
}
