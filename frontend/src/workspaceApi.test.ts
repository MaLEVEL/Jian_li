import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE } from "./constants";
import {
  WORKSPACE_SYNC_KEY,
  WorkspaceConflictError,
  clearWorkspaceSyncMeta,
  createWorkspaceApi,
  loadWorkspaceSyncMeta,
  markWorkspaceClean,
  markWorkspaceDirty,
  type WorkspaceStatePayload,
} from "./workspaceApi";

const state: WorkspaceStatePayload = {
  version: 1,
  exportedAt: "2026-11-18T00:00:00.000Z",
  profile: DEFAULT_PROFILE,
  resumes: [],
  applications: [],
};

afterEach(() => vi.restoreAllMocks());

describe("workspace sync API", () => {
  it("treats a missing server snapshot as a first sync", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not found", { status: 404 }));
    await expect(createWorkspaceApi("http://127.0.0.1:18001").load()).resolves.toBeNull();
  });

  it("sends the expected revision without mixing provider credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      state, updated_at: state.exportedAt, revision: 3,
    }));
    await createWorkspaceApi("http://127.0.0.1:18001/").save(state, 2);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ state, expected_revision: 2 });
    expect(JSON.stringify(body)).not.toMatch(/apiKey|baseUrl|model/);
  });

  it("surfaces revision conflicts with the current server snapshot", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      detail: "conflict",
      current: { state, updated_at: state.exportedAt, revision: 4 },
    }), { status: 409, headers: { "Content-Type": "application/json" } }));
    const error = await createWorkspaceApi("http://127.0.0.1:18001").save(state, 2).catch((value) => value);
    expect(error).toBeInstanceOf(WorkspaceConflictError);
    expect(error.current.revision).toBe(4);
  });
});


describe("workspace pending-save metadata", () => {
  function memoryStorage() {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
  }

  it("keeps dirty local changes and their base revision across reloads", () => {
    const storage = memoryStorage();
    markWorkspaceDirty(7, storage);

    expect(loadWorkspaceSyncMeta(storage)).toEqual({ dirty: true, revision: 7 });
    expect(JSON.parse(storage.getItem(WORKSPACE_SYNC_KEY) ?? "{}")).toEqual({ dirty: true, revision: 7 });
  });

  it("clears dirty state only after a successful server save", () => {
    const storage = memoryStorage();
    markWorkspaceDirty(7, storage);
    markWorkspaceClean(8, storage);

    expect(loadWorkspaceSyncMeta(storage)).toEqual({ dirty: false, revision: 8 });
    clearWorkspaceSyncMeta(storage);
    expect(loadWorkspaceSyncMeta(storage)).toEqual({ dirty: false, revision: null });
  });

  it("treats malformed local metadata as clean instead of crashing hydration", () => {
    const storage = memoryStorage();
    storage.setItem(WORKSPACE_SYNC_KEY, "{broken");
    expect(loadWorkspaceSyncMeta(storage)).toEqual({ dirty: false, revision: null });
  });
});
