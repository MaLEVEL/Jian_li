import { describe, expect, it, vi } from "vitest";
import {
  PROVIDER_SETTINGS_KEY,
  createBossIntegrationApi,
  isTrustedLocalServiceUrl,
  loadProviderSettings,
  normalizeProviderSettings,
  saveProviderSettings,
  testProviderConnection,
} from "./bossIntegration";

function storage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => { value = next; }),
  };
}

describe("BOSS integration settings", () => {
  it("normalizes provider URLs and defaults missing values", () => {
    expect(normalizeProviderSettings({ baseUrl: "https://example.com/v1///", model: " model-a " })).toEqual({
      baseUrl: "https://example.com/v1",
      apiKey: "",
      model: "model-a",
    });
    expect(loadProviderSettings(storage()).baseUrl).toBe("https://open.bigmodel.cn/api/paas/v4");
  });

  it("saves the key only through the supplied browser storage", () => {
    const target = storage();
    saveProviderSettings({ baseUrl: "https://api.example.com/v1/", apiKey: " local-key ", model: " model-a " }, target);
    expect(target.setItem).toHaveBeenCalledWith(PROVIDER_SETTINGS_KEY, JSON.stringify({
      baseUrl: "https://api.example.com/v1",
      apiKey: "local-key",
      model: "model-a",
    }));
  });

  it("rejects malformed locally persisted JSON without crashing", () => {
    expect(loadProviderSettings(storage("{bad json")).apiKey).toBe("");
  });
});

describe("local service URL trust", () => {
  it("accepts loopback, private LAN, and Tailscale hosts while rejecting public hosts", () => {
    expect(isTrustedLocalServiceUrl("http://127.0.0.1:18001")).toBe(true);
    expect(isTrustedLocalServiceUrl("http://192.168.1.20:18001")).toBe(true);
    expect(isTrustedLocalServiceUrl("http://100.80.1.2:18001")).toBe(true);
    expect(isTrustedLocalServiceUrl("http://jobfit.tail1234.ts.net:18001")).toBe(true);
    expect(isTrustedLocalServiceUrl("https://collector.example.com")).toBe(false);
    expect(isTrustedLocalServiceUrl("http://169.254.169.254")).toBe(false);
    expect(isTrustedLocalServiceUrl("http://127.attacker.example:18001")).toBe(false);
    expect(isTrustedLocalServiceUrl("http://127.0.0.1.attacker.example:18001")).toBe(false);
  });
});
describe("provider connection test", () => {
  it("rejects an untrusted service endpoint without sending the API key or calling fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network access is forbidden in this test"));

    await expect(testProviderConnection({
      baseUrl: "https://api.example.com/v1/",
      apiKey: "local-secret",
      model: "model-a",
    }, "https://collector.example.com")).rejects.toThrow(
      "为避免密钥外泄，模型配置只能发送到本机、局域网或 Tailscale 私有服务。",
    );

    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("uses the local backend and sends credentials only in request headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      ok: true, model: "model-a", mode: "online", latency_ms: 12,
    }));
    await testProviderConnection({
      baseUrl: "https://api.example.com/v1/",
      apiKey: "local-secret",
      model: "model-a",
    }, "http://127.0.0.1:18001/");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:18001/api/provider/test",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-API-Key": "local-secret",
          "X-API-Base-URL": "https://api.example.com/v1",
          "X-Model": "model-a",
        },
      }),
    );
    fetchMock.mockRestore();
  });

  it("waits 60 seconds for the provider probe instead of using the ordinary request timeout", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | null | undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      requestSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    });

    let settled = false;
    const request = testProviderConnection({
      baseUrl: "https://api.example.com/v1/",
      apiKey: "local-secret",
      model: "model-a",
    }, "http://127.0.0.1:18001");
    request.then(
      () => { settled = true; },
      () => { settled = true; },
    );

    await vi.advanceTimersByTimeAsync(6_001);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    expect(requestSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(53_999);
    await expect(request).rejects.toThrow("浏览器无法连接本机职启云帆服务，请确认 Docker 正在运行。");
    expect(requestSignal?.aborted).toBe(true);

    fetchMock.mockRestore();
    vi.useRealTimers();
  });
});
describe("BOSS integration API", () => {
  it("uses the agreed local endpoints", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json([]));
    const api = createBossIntegrationApi("http://127.0.0.1:18001/");
    await api.listJobs();
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:18001/api/boss/jobs", expect.objectContaining({
      headers: expect.objectContaining({ Accept: "application/json" }),
    }));
    fetchMock.mockRestore();
  });

  it("requests a bounded page and reads the server total", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", {
      headers: { "Content-Type": "application/json", "X-Total-Count": "87" },
    }));
    const page = await createBossIntegrationApi("http://127.0.0.1:18001").listJobsPage(30, 60);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:18001/api/boss/jobs?limit=30&offset=60",
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/json" }) }),
    );
    expect(page).toEqual({ jobs: [], total: 87, offset: 60, limit: 30 });
    fetchMock.mockRestore();
  });
});
