import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgentApiError,
  agentApi,
  buildSkillRunMarkdown,
  createAgentApi,
  parseBatchJobs,
} from "./agentApi";
import type { AgentHealth, SkillRunResult } from "./agentTypes";

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

  it("sends browser-local provider settings only on model-backed requests", async () => {
    const fetchMock = mockFetch(Response.json(health));
    fetchMock.mockResolvedValueOnce(Response.json(health));
    fetchMock.mockResolvedValueOnce(Response.json({}));
    const api = createAgentApi({
      baseUrl: "http://127.0.0.1:9000",
      providerSettings: () => ({
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        apiKey: "local-secret",
        model: "glm-test",
      }),
    });

    await api.getHealth();
    await api.analyze({ resume_text: "resume", jd_text: "jd", company: "company", title: "title" });

    const healthHeaders = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const analysisHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(healthHeaders).not.toHaveProperty("X-API-Key");
    expect(analysisHeaders).toMatchObject({
      "X-API-Key": "local-secret",
      "X-API-Base-URL": "https://open.bigmodel.cn/api/paas/v4",
      "X-Model": "glm-test",
    });
  });
  it("refuses to send provider credentials to a public backend URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const api = createAgentApi({
      baseUrl: "https://collector.example.com",
      providerSettings: () => ({ baseUrl: "https://api.example.com/v1", apiKey: "secret", model: "model" }),
    });
    await expect(api.analyze({ resume_text: "r", jd_text: "j", company: "c", title: "t" }))
      .rejects.toThrow(/密钥外泄/);
    expect(fetchMock).not.toHaveBeenCalled();
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
    const api = createAgentApi({ baseUrl: "http://localhost:18001" });

    const error = await api.getHealth().catch((currentError: unknown) => currentError);
    expect(error).toBeInstanceOf(AgentApiError);
    expect(error).toMatchObject({ status: 413, message: "简历文件超过 2MB" });
  });

  it("uploads resume files as multipart data without a JSON content type", async () => {
    const fetchMock = mockFetch(Response.json({ text: "Python developer", filename: "resume.pdf" }));
    const api = createAgentApi({ baseUrl: "http://localhost:18001" });
    const file = new File(["resume"], "resume.pdf", { type: "application/pdf" });

    await api.parseResume(file);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).not.toHaveProperty("Content-Type");
  });
});

describe("business skill API client", () => {
  const skillRun: SkillRunResult = {
    id: "run-1",
    skill_id: "resume-tailor",
    skill_name: "简历定制改写",
    skill_version: "1.0.0",
    analysis_id: "analysis-1",
    title: "星河科技 · Python Agent 工程师",
    mode: "online",
    model: "glm-4",
    warnings: ["改写建议需人工核实"],
    duration_ms: 1800,
    usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 },
    created_at: "2026-11-18T10:00:00.000Z",
    sections: [
      {
        title: "定制建议",
        items: [
          {
            heading: "项目经历改写",
            content: "保留真实职责，并按 JD 顺序重组表达。",
            kind: "proposal",
            source_ids: ["resume", "material-1"],
            review_required: true,
          },
        ],
      },
    ],
    sources: [
      { id: "resume", title: "简历原文", content: "负责 FastAPI 接口开发" },
      { id: "material-1", title: "项目素材", content: "完成用户模块接口联调" },
    ],
  };

  it("calls the controlled skill registry, run, and history endpoints", async () => {
    const fetchMock = mockFetch(Response.json([]));
    fetchMock.mockResolvedValueOnce(Response.json(skillRun));
    fetchMock.mockResolvedValueOnce(Response.json([skillRun]));
    fetchMock.mockResolvedValueOnce(Response.json(skillRun));
    const api = createAgentApi({ baseUrl: "http://localhost:18001" });

    await api.listSkills();
    await api.runSkill("resume-tailor", { analysis_id: "analysis-1" });
    await api.listSkillRuns("analysis-1");
    await api.getSkillRun("run-1");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:18001/api/skills",
      "http://localhost:18001/api/skills/resume-tailor/run",
      "http://localhost:18001/api/skill-runs?analysis_id=analysis-1",
      "http://localhost:18001/api/skill-runs/run-1",
    ]);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ analysis_id: "analysis-1" }),
    });
  });

  it("renders a skill result as reviewable Markdown with metadata and sources", () => {
    const markdown = buildSkillRunMarkdown(skillRun);

    expect(markdown).toContain("# 简历定制改写：星河科技 · Python Agent 工程师");
    expect(markdown).toContain("- 模式：在线模型（online）");
    expect(markdown).toContain("- Token：1200 输入 / 300 输出 / 1500 总计");
    expect(markdown).toContain("## 定制建议");
    expect(markdown).toContain("### 项目经历改写");
    expect(markdown).toContain("> 保留真实职责，并按 JD 顺序重组表达。");
    expect(markdown).toContain("- 来源：resume、material-1");
    expect(markdown).toContain("- 状态：需人工核实");
    expect(markdown).toContain("## 来源");
    expect(markdown).toContain("### 简历原文");
    expect(markdown).toContain("```text\n负责 FastAPI 接口开发\n```");
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
