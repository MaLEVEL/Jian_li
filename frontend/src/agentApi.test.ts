import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgentApiError,
  agentApi,
  createAgentApi,
  parseBatchJobs,
} from "./agentApi";
import type { AgentHealth } from "./agentTypes";

const health: AgentHealth = {
  status: "ok",
  mode: "ai",
  model: "glm-4",
  rag_mode: "bm25",
};

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("agent API client", () => {
  it("sends JSON requests to the configured backend and returns typed data", async () => {
    const fetchMock = mockFetch(Response.json(health));
    const api = createAgentApi({ baseUrl: "http://127.0.0.1:9000/" });

    await expect(api.getHealth()).resolves.toEqual(health);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:9000/api/health",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("uses same-origin /api paths by default", async () => {
    const fetchMock = mockFetch(Response.json(health));

    await agentApi.getHealth();
    expect(fetchMock).toHaveBeenCalledWith("/api/health", expect.anything());
  });

  it("returns the backend detail message for HTTP errors", async () => {
    mockFetch(new Response(JSON.stringify({ detail: "简历文件超过 2MB" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    }));
    const api = createAgentApi({ baseUrl: "http://localhost:8000" });

    const error = await api.getHealth().catch((currentError: unknown) => currentError);
    expect(error).toBeInstanceOf(AgentApiError);
    expect(error).toMatchObject({ status: 413, message: "简历文件超过 2MB" });
  });

  it("uploads resume files as multipart data without a JSON content type", async () => {
    const fetchMock = mockFetch(Response.json({ text: "Python developer", filename: "resume.pdf" }));
    const api = createAgentApi({ baseUrl: "http://localhost:8000" });
    const file = new File(["resume"], "resume.pdf", { type: "application/pdf" });

    await api.parseResume(file);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).not.toHaveProperty("Content-Type");
  });
});

describe("batch job import parser", () => {
  it("parses a JSON array and a jobs object", () => {
    const input = [
      { company: "星河", title: "Python 后端", jd_text: "FastAPI" },
      { company: "云舟", title: "Agent 工程师", jd_text: "LangGraph" },
    ];

    expect(parseBatchJobs(JSON.stringify(input))).toEqual(input);
    expect(parseBatchJobs(JSON.stringify({ jobs: input }))).toEqual(input);
  });

  it("parses pipe- or tab-separated text records", () => {
    const pipeText = "星河|Python 后端|FastAPI，SQL\n云舟\tAgent 工程师\tLangGraph，RAG";
    expect(parseBatchJobs(pipeText)).toEqual([
      { company: "星河", title: "Python 后端", jd_text: "FastAPI，SQL" },
      { company: "云舟", title: "Agent 工程师", jd_text: "LangGraph，RAG" },
    ]);
  });

  it("rejects blank imports, malformed records, and more than twenty jobs", () => {
    expect(() => parseBatchJobs(" ")).toThrow(AgentApiError);
    expect(() => parseBatchJobs("星河|Python 后端")).toThrow(AgentApiError);
    expect(() => parseBatchJobs(JSON.stringify(Array.from({ length: 21 }, (_, index) => ({
      company: `公司${index}`,
      title: "工程师",
      jd_text: "岗位要求",
    }))))).toThrow(AgentApiError);
  });
});

