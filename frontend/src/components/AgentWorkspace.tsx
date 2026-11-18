import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardPaste,
  Database,
  Download,
  FileText,
  FileUp,
  History,
  ListChecks,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { MAX_BATCH_JOBS, agentApi, parseBatchJobs } from "../agentApi";
import type {
  AgentHealth,
  Analysis,
  BatchJobInput,
  Material,
} from "../agentTypes";
import { EmptyState, PanelTitle, StatusMessage } from "../components";
import type { CandidateProfile, ResumeVersion } from "../types";
import "./AgentWorkspace.css";

type ResumeSourceMode = "library" | "paste" | "upload";
type MaterialDraftState = { title: string; content: string; tags: string };

const emptyBatchJob: BatchJobInput = { company: "", title: "", jd_text: "" };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function modeLabel(mode: string) {
  if (mode === "online" || mode === "ai") return "在线模型";
  if (mode === "degraded") return "降级模式";
  if (mode === "offline") return "离线规则";
  return mode || "未返回";
}

function statusLabel(status: string) {
  if (status === "completed") return "完成";
  if (status === "degraded") return "降级";
  if (status === "failed") return "失败";
  return status || "未返回";
}

function isBatchJobReady(job: BatchJobInput) {
  return Boolean(job.company.trim() && job.title.trim() && job.jd_text.trim());
}

function AnalysisReport({ analysis }: { analysis: Analysis }) {
  return (
    <article className="agent-report" aria-label={`${analysis.company} ${analysis.title} 分析报告`}>
      <header>
        <div>
          <span>技能覆盖分</span>
          <strong className="agent-report__score">{analysis.score}</strong>
        </div>
        <div>
          <h3>{analysis.company || "未命名公司"} · {analysis.title || "未命名职位"}</h3>
          <p>{analysis.explanation}</p>
        </div>
      </header>

      <dl className="agent-meta-grid" aria-label="分析元数据">
        <div><dt>运行模式</dt><dd>{modeLabel(analysis.mode)}</dd></div>
        <div><dt>模型</dt><dd>{analysis.model || "未返回"}</dd></div>
        <div><dt>检索模式</dt><dd>{analysis.rag_mode || "未返回"}</dd></div>
        <div><dt>耗时</dt><dd>{analysis.duration_ms} ms</dd></div>
        <div><dt>输入 Token</dt><dd>{analysis.usage.prompt_tokens}</dd></div>
        <div><dt>输出 Token</dt><dd>{analysis.usage.completion_tokens}</dd></div>
        <div><dt>总 Token</dt><dd>{analysis.usage.total_tokens}</dd></div>
        <div><dt>分析时间</dt><dd>{formatDateTime(analysis.created_at)}</dd></div>
      </dl>

      {analysis.warnings.length ? (
        <div className="agent-warning-list" role="status">
          <AlertTriangle size={17} />
          <ul>
            {analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}

      <section aria-label="技能匹配与评分依据">
        <h4>评分依据</h4>
        <div className="agent-breakdown">
          {analysis.breakdown.map((item) => (
            <div className={item.matched ? "is-matched" : "is-missing"} key={`${item.skill}-${item.weight}`}>
              <div>
                <strong>{item.skill}</strong>
                <span>{item.matched ? "命中" : "缺失"} · 权重 {item.weight}</span>
              </div>
              <p>{item.evidence || (item.matched ? "后端未返回命中证据。" : "当前简历未找到直接证据。")}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="agent-skill-columns">
        <section aria-label="命中技能">
          <h4>命中技能</h4>
          {analysis.matched_skills.length ? <ul>{analysis.matched_skills.map((skill) => <li key={skill}>{skill}</li>)}</ul> : <p>无</p>}
        </section>
        <section aria-label="缺失技能">
          <h4>缺失技能</h4>
          {analysis.missing_skills.length ? <ul>{analysis.missing_skills.map((skill) => <li key={skill}>{skill}</li>)}</ul> : <p>无</p>}
        </section>
      </div>

      <section aria-label="改进建议">
        <h4>改进建议</h4>
        <div className="agent-advice-list">
          {analysis.advice.map((item) => (
            <article key={`${item.skill}-${item.suggestion}`}>
              <strong>{item.skill}{item.supported ? " · 有素材支撑" : " · 学习建议"}</strong>
              <p>{item.suggestion}</p>
              <small>证据引用：{item.evidence_ids.length ? item.evidence_ids.join("、") : "无"}</small>
            </article>
          ))}
        </div>
      </section>

      <section aria-label="引用素材">
        <h4>证据与素材引用</h4>
        <div className="agent-evidence-list">
          {analysis.evidence.map((evidence) => (
            <article key={evidence.id}>
              <div>
                <strong>{evidence.title}</strong>
                <span>{evidence.source} · 相关度 {evidence.score}</span>
              </div>
              <p>{evidence.content}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-label="Agent 执行轨迹">
        <h4>执行轨迹</h4>
        <ol className="agent-trace">
          {analysis.trace.map((node) => (
            <li key={`${node.node}-${node.duration_ms}`}>
              <span>{node.node}</span>
              <strong className={node.status === "degraded" ? "is-degraded" : undefined}>{statusLabel(node.status)}</strong>
              <small>{node.duration_ms} ms</small>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

export function AgentWorkspace({
  profile,
  resumes,
  selectedResumeId,
  onSelectResume,
}: {
  profile: CandidateProfile;
  resumes: ResumeVersion[];
  selectedResumeId: string;
  onSelectResume: (id: string) => void;
}) {
  const [health, setHealth] = useState<AgentHealth | undefined>();
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState("");
  const [resumeMode, setResumeMode] = useState<ResumeSourceMode>(resumes.length ? "library" : "paste");
  const [pastedResume, setPastedResume] = useState("");
  const [uploadedResume, setUploadedResume] = useState<{ filename: string; text: string } | undefined>();
  const [resumeUploading, setResumeUploading] = useState(false);
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [jdText, setJdText] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | undefined>();
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [batchJobs, setBatchJobs] = useState<BatchJobInput[]>([{ ...emptyBatchJob }]);
  const [batchImport, setBatchImport] = useState("");
  const [batchNotice, setBatchNotice] = useState("");
  const [batchError, setBatchError] = useState("");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResults, setBatchResults] = useState<Analysis[]>([]);
  const [batchErrors, setBatchErrors] = useState<Array<{ index: number; title: string; error: string }>>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [materialsError, setMaterialsError] = useState("");
  const [materialDraft, setMaterialDraft] = useState<MaterialDraftState>({ title: "", content: "", tags: "" });
  const [materialSaving, setMaterialSaving] = useState(false);
  const [deletingMaterialId, setDeletingMaterialId] = useState("");
  const [materialError, setMaterialError] = useState("");
  const [history, setHistory] = useState<Analysis[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  const selectedResume = useMemo(
    () => resumes.find((resume) => resume.id === selectedResumeId) ?? resumes[0],
    [resumes, selectedResumeId],
  );
  const activeResumeText =
    resumeMode === "library" ? selectedResume?.plainText ?? "" : resumeMode === "paste" ? pastedResume : uploadedResume?.text ?? "";
  const readyBatchJobs = batchJobs.filter(isBatchJobReady);
  const batchInputInvalid = batchJobs.length > MAX_BATCH_JOBS || batchJobs.some((job) => !isBatchJobReady(job) && Boolean(job.company || job.title || job.jd_text));
  const candidateMaterialContent = useMemo(() => (
    [
      profile.headline ? `定位：${profile.headline}` : "",
      profile.education ? `教育：${profile.education}` : "",
      profile.skills ? `技能：${profile.skills}` : "",
      profile.projects ? `项目：${profile.projects}` : "",
      profile.experience ? `经历：${profile.experience}` : "",
      profile.awards ? `荣誉：${profile.awards}` : "",
    ].filter(Boolean).join("\n")
  ), [profile]);

  async function loadHealth() {
    setHealthLoading(true);
    setHealthError("");
    try {
      setHealth(await agentApi.getHealth());
    } catch (error) {
      setHealthError(getErrorMessage(error, "无法读取后端健康状态。"));
    } finally {
      setHealthLoading(false);
    }
  }

  async function loadMaterials() {
    setMaterialsLoading(true);
    setMaterialsError("");
    try {
      setMaterials(await agentApi.listMaterials());
    } catch (error) {
      setMaterialsError(getErrorMessage(error, "无法读取经历素材。"));
    } finally {
      setMaterialsLoading(false);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      setHistory(await agentApi.listHistory());
    } catch (error) {
      setHistoryError(getErrorMessage(error, "无法读取分析历史。"));
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    void loadHealth();
    void loadMaterials();
    void loadHistory();
  }, []);

  useEffect(() => {
    if (resumeMode === "library" && !resumes.length) {
      setResumeMode("paste");
    }
  }, [resumeMode, resumes.length]);

  async function handleResumeUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setResumeUploading(true);
    setAnalysisError("");
    try {
      const parsed = await agentApi.parseResume(file);
      setUploadedResume(parsed);
      setResumeMode("upload");
    } catch (error) {
      setAnalysisError(getErrorMessage(error, "简历上传解析失败。"));
    } finally {
      setResumeUploading(false);
    }
  }

  async function runAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeResumeText.trim()) {
      setAnalysisError("请选择已有简历、粘贴简历文本，或上传 PDF/TXT。");
      return;
    }
    if (!company.trim() || !title.trim() || !jdText.trim()) {
      setAnalysisError("单条分析需要填写公司、职位和 JD。");
      return;
    }

    setAnalysisLoading(true);
    setAnalysisError("");
    try {
      const result = await agentApi.analyze({
        resume_text: activeResumeText.trim(),
        company: company.trim(),
        title: title.trim(),
        jd_text: jdText.trim(),
      });
      setAnalysis(result);
      await loadHistory();
    } catch (error) {
      setAnalysisError(getErrorMessage(error, "Agent 分析失败。"));
    } finally {
      setAnalysisLoading(false);
    }
  }

  function updateBatchJob(index: number, patch: Partial<BatchJobInput>) {
    setBatchJobs((current) => current.map((job, jobIndex) => jobIndex === index ? { ...job, ...patch } : job));
  }

  function importBatchJobs() {
    setBatchError("");
    setBatchNotice("");
    try {
      const parsed = parseBatchJobs(batchImport);
      setBatchJobs(parsed);
      setBatchNotice(`已导入 ${parsed.length} 条岗位，可先检查再运行批量分析。`);
      setBatchImport("");
    } catch (error) {
      setBatchError(getErrorMessage(error, "批量岗位导入失败。"));
    }
  }

  async function runBatchAnalysis() {
    if (!activeResumeText.trim()) {
      setBatchError("批量分析同样需要先选择或提供简历文本。");
      return;
    }
    if (!readyBatchJobs.length || batchInputInvalid) {
      setBatchError("请完整填写公司、职位和 JD；空白行可以直接删除。");
      return;
    }

    setBatchLoading(true);
    setBatchError("");
    try {
      const response = await agentApi.analyzeBatch({
        resume_text: activeResumeText.trim(),
        jobs: readyBatchJobs.map((job) => ({
          company: job.company.trim(),
          title: job.title.trim(),
          jd_text: job.jd_text.trim(),
        })),
      });
      setBatchResults(response.results);
      setBatchErrors(response.errors);
      setBatchNotice(`批量分析完成：${response.results.length} 条成功，${response.errors.length} 条失败。`);
      await loadHistory();
    } catch (error) {
      setBatchError(getErrorMessage(error, "批量分析失败。"));
    } finally {
      setBatchLoading(false);
    }
  }

  async function exportBatchCsv() {
    if (!activeResumeText.trim() || !readyBatchJobs.length || batchInputInvalid) {
      setBatchError("导出 CSV 前请提供简历并完整填写批量岗位。");
      return;
    }
    setBatchLoading(true);
    setBatchError("");
    try {
      const blob = await agentApi.exportBatchCsv({
        resume_text: activeResumeText.trim(),
        jobs: readyBatchJobs.map((job) => ({
          company: job.company.trim(),
          title: job.title.trim(),
          jd_text: job.jd_text.trim(),
        })),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `jobfit-agent-batch-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setBatchError(getErrorMessage(error, "CSV 导出失败。"));
    } finally {
      setBatchLoading(false);
    }
  }

  function fillMaterialFromProfile() {
    setMaterialDraft({
      title: `${profile.name || "候选人"}经历素材`,
      content: candidateMaterialContent,
      tags: "经历库导入",
    });
    setMaterialError("");
  }

  async function createMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!materialDraft.title.trim() || !materialDraft.content.trim()) {
      setMaterialError("素材标题和内容不能为空。");
      return;
    }
    setMaterialSaving(true);
    setMaterialError("");
    try {
      await agentApi.createMaterial({
        title: materialDraft.title.trim(),
        content: materialDraft.content.trim(),
        tags: materialDraft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      setMaterialDraft({ title: "", content: "", tags: "" });
      await loadMaterials();
    } catch (error) {
      setMaterialError(getErrorMessage(error, "素材保存失败。"));
    } finally {
      setMaterialSaving(false);
    }
  }

  async function removeMaterial(id: string) {
    setDeletingMaterialId(id);
    setMaterialError("");
    try {
      await agentApi.deleteMaterial(id);
      setMaterials((current) => current.filter((material) => material.id !== id));
    } catch (error) {
      setMaterialError(getErrorMessage(error, "素材删除失败。"));
    } finally {
      setDeletingMaterialId("");
    }
  }

  const report = analysis;

  return (
    <div className="stack agent-workspace">
      <section className="panel agent-command" aria-label="Python Agent 工作台概览">
        <PanelTitle icon={<Bot size={20} />} title="Python / Agent 工作台" />
        <div>
          <p>
            由 FastAPI、LangGraph 和本地素材库执行可解释分析。原有“JD 匹配”页仍保留浏览器本地关键词规则，
            本页显示的模型、检索与降级状态均来自 Python 后端。
          </p>
          <dl className="agent-health-grid" aria-label="后端健康与只读设置">
            <div><dt>服务状态</dt><dd>{healthLoading ? "读取中" : health ? health.status : "不可用"}</dd></div>
            <div><dt>Python 模式</dt><dd>{health ? modeLabel(health.mode) : "未知"}</dd></div>
            <div><dt>模型</dt><dd>{health ? health.model : "未知"}</dd></div>
            <div><dt>RAG 模式</dt><dd>{health ? health.rag_mode : "未知"}</dd></div>
          </dl>
          <div className="agent-health-actions">
            <button className="secondary-button compact-button" type="button" onClick={() => void loadHealth()} disabled={healthLoading}>
              <RefreshCcw size={17} />
              刷新健康状态
            </button>
            <span>设置只读；模型和密钥由后端 .env 管理，前端不提供密钥输入。</span>
          </div>
          {healthError ? <StatusMessage text={healthError} type="error" /> : null}
        </div>
      </section>

      <div className="agent-layout">
        <div className="stack">
          <section className="panel" aria-label="单岗位 Agent 分析">
            <PanelTitle icon={<Activity size={20} />} title="单岗位深度分析" />
            <form className="agent-form" onSubmit={runAnalysis}>
              <fieldset>
                <legend>简历来源</legend>
                <div className="agent-source-tabs" role="tablist" aria-label="选择简历来源">
                  <button type="button" role="tab" aria-selected={resumeMode === "library"} className={resumeMode === "library" ? "is-active" : ""} onClick={() => setResumeMode("library")} disabled={!resumes.length}>
                    <FileText size={17} />简历版本
                  </button>
                  <button type="button" role="tab" aria-selected={resumeMode === "paste"} className={resumeMode === "paste" ? "is-active" : ""} onClick={() => setResumeMode("paste")}>
                    <ClipboardPaste size={17} />粘贴文本
                  </button>
                  <button type="button" role="tab" aria-selected={resumeMode === "upload"} className={resumeMode === "upload" ? "is-active" : ""} onClick={() => setResumeMode("upload")}>
                    <FileUp size={17} />上传 PDF/TXT
                  </button>
                </div>

                {resumeMode === "library" ? (
                  <label>
                    选择已有简历
                    <select value={selectedResume?.id ?? ""} onChange={(event) => onSelectResume(event.target.value)}>
                      {resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.title}</option>)}
                    </select>
                    <small>{activeResumeText ? `${activeResumeText.length} 个字符` : "该简历没有可用文本。"}</small>
                  </label>
                ) : null}
                {resumeMode === "paste" ? (
                  <label>
                    简历文本
                    <textarea value={pastedResume} onChange={(event) => setPastedResume(event.target.value)} placeholder="粘贴完整简历文本" />
                  </label>
                ) : null}
                {resumeMode === "upload" ? (
                  <div className="agent-upload">
                    <label className="ghost-button file-button">
                      <FileUp size={17} />
                      {resumeUploading ? "解析中…" : "选择 PDF/TXT"}
                      <input type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={handleResumeUpload} disabled={resumeUploading} />
                    </label>
                    <small>{uploadedResume ? `已解析：${uploadedResume.filename} · ${uploadedResume.text.length} 个字符` : "文件会提交到本地 FastAPI 解析，大小不超过 2MB。"}</small>
                  </div>
                ) : null}
              </fieldset>

              <div className="agent-two-fields">
                <label>公司<input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="例如：智谱生态公司" /></label>
                <label>职位<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：Python Agent 工程师" /></label>
              </div>
              <label>
                岗位 JD
                <textarea value={jdText} onChange={(event) => setJdText(event.target.value)} placeholder="粘贴岗位职责与任职要求" />
              </label>
              <div className="agent-form-actions">
                <button className="primary-button" type="submit" disabled={analysisLoading || resumeUploading}>
                  <Activity size={17} />
                  {analysisLoading ? "Agent 分析中…" : "运行 Agent 分析"}
                </button>
              </div>
            </form>
            {analysisError ? <StatusMessage text={analysisError} type="error" /> : null}
          </section>

          <section className="panel" aria-label="批量岗位分析">
            <PanelTitle icon={<ListChecks size={20} />} title={`批量 JD 排序（最多 ${MAX_BATCH_JOBS} 条）`} />
            <div className="agent-batch-toolbar">
              <button className="secondary-button compact-button" type="button" onClick={() => setBatchJobs((current) => current.length < MAX_BATCH_JOBS ? [...current, { ...emptyBatchJob }] : current)}>
                <Plus size={17} />添加岗位
              </button>
              <button className="secondary-button compact-button" type="button" onClick={runBatchAnalysis} disabled={batchLoading}>
                <ListChecks size={17} />{batchLoading ? "批量分析中…" : "批量分析"}
              </button>
              <button className="secondary-button compact-button" type="button" onClick={() => void exportBatchCsv()} disabled={batchLoading}>
                <Download size={17} />导出 CSV
              </button>
            </div>

            <div className="agent-batch-list" aria-live="polite">
              {batchJobs.map((job, index) => (
                <div className="agent-batch-row" key={`${index}-${job.company}-${job.title}`}>
                  <label>公司<input value={job.company} onChange={(event) => updateBatchJob(index, { company: event.target.value })} placeholder="公司" /></label>
                  <label>职位<input value={job.title} onChange={(event) => updateBatchJob(index, { title: event.target.value })} placeholder="职位" /></label>
                  <label>JD<textarea value={job.jd_text} onChange={(event) => updateBatchJob(index, { jd_text: event.target.value })} placeholder="岗位 JD" /></label>
                  <button className="destructive-button icon-button" type="button" onClick={() => setBatchJobs((current) => current.length > 1 ? current.filter((_, rowIndex) => rowIndex !== index) : [{ ...emptyBatchJob }])} aria-label={`删除第 ${index + 1} 条岗位`}>
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>

            <details className="agent-import">
              <summary>JSON / 文本导入</summary>
              <label>
                批量岗位内容
                <textarea value={batchImport} onChange={(event) => setBatchImport(event.target.value)} placeholder='[{"company":"星河","title":"Python 后端","jd_text":"FastAPI，SQL"}] 或每行：公司 | 职位 | JD' />
              </label>
              <button className="secondary-button compact-button" type="button" onClick={importBatchJobs}>
                <ClipboardPaste size={17} />解析并替换表格
              </button>
            </details>
            {batchNotice ? <StatusMessage text={batchNotice} type="success" /> : null}
            {batchError ? <StatusMessage text={batchError} type="error" /> : null}

            {batchResults.length ? (
              <ol className="agent-ranked-list" aria-label="批量分析结果">
                {batchResults.map((result, index) => (
                  <li key={result.id}>
                    <span>{index + 1}</span>
                    <div><strong>{result.company} · {result.title}</strong><small>{modeLabel(result.mode)} · {result.warnings.length} 条警告</small></div>
                    <strong className="agent-ranked-score">{result.score}</strong>
                    <button className="ghost-button compact-button" type="button" onClick={() => setAnalysis(result)}>查看报告</button>
                  </li>
                ))}
              </ol>
            ) : null}
            {batchErrors.length ? (
              <div className="agent-batch-failures">
                <strong>失败岗位</strong>
                <ul>{batchErrors.map((error) => <li key={`${error.index}-${error.title}`}>第 {error.index + 1} 条 {error.title || "未命名"}：{error.error}</li>)}</ul>
              </div>
            ) : null}
          </section>

          <section className="panel" aria-label="经历素材库">
            <PanelTitle icon={<Database size={20} />} title="经历素材库" />
            <div className="agent-material-toolbar">
              <button className="secondary-button compact-button" type="button" onClick={fillMaterialFromProfile} disabled={!candidateMaterialContent}>
                <Database size={17} />从经历库带入
              </button>
              <span>素材由 Python 后端存入 SQLite，用于检索和证据引用。</span>
            </div>
            <form className="agent-material-form" onSubmit={createMaterial}>
              <label>素材标题<input value={materialDraft.title} onChange={(event) => setMaterialDraft((current) => ({ ...current, title: event.target.value }))} placeholder="例如：FastAPI 实习项目" /></label>
              <label>素材内容<textarea value={materialDraft.content} onChange={(event) => setMaterialDraft((current) => ({ ...current, content: event.target.value }))} placeholder="写真实项目、职责、结果，不虚构经历或数据" /></label>
              <label>标签（逗号分隔）<input value={materialDraft.tags} onChange={(event) => setMaterialDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="Python, FastAPI, Agent" /></label>
              <button className="primary-button" type="submit" disabled={materialSaving}>
                <Plus size={17} />{materialSaving ? "保存中…" : "新增素材"}
              </button>
            </form>
            {materialError ? <StatusMessage text={materialError} type="error" /> : null}
            {materialsLoading ? <p className="agent-loading-text">素材读取中…</p> : null}
            {materialsError ? <StatusMessage text={materialsError} type="error" /> : null}
            {!materialsLoading && !materials.length ? <EmptyState title="还没有素材" text="先从经历库带入，或添加项目、实习、技能证明，分析建议会引用这些真实片段。" /> : null}
            <ul className="agent-material-list">
              {materials.map((material) => (
                <li key={material.id}>
                  <div>
                    <strong>{material.title}</strong>
                    <small>{formatDateTime(material.created_at)}{material.tags.length ? ` · ${material.tags.join("、")}` : ""}</small>
                    <p>{material.content}</p>
                  </div>
                  <button className="destructive-button icon-button" type="button" onClick={() => void removeMaterial(material.id)} disabled={deletingMaterialId === material.id} aria-label={`删除素材 ${material.title}`}>
                    <Trash2 size={17} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="stack">
          <section className="panel agent-report-panel" aria-label="Agent 分析报告">
            <PanelTitle icon={<CheckCircle2 size={20} />} title="分析报告" />
            {report ? <AnalysisReport analysis={report} /> : (
              <EmptyState title="等待 Agent 分析" text="运行单岗位分析、批量分析或打开历史记录后，这里会显示评分依据、证据引用、执行轨迹和 Token 用量。" />
            )}
          </section>

          <section className="panel" aria-label="Agent 分析历史">
            <PanelTitle icon={<History size={20} />} title="分析历史" />
            <div className="agent-history-toolbar">
              <button className="secondary-button compact-button" type="button" onClick={() => void loadHistory()} disabled={historyLoading}>
                <RefreshCcw size={17} />刷新历史
              </button>
              <span>{historyLoading ? "读取中…" : `${history.length} 条记录`}</span>
            </div>
            {historyError ? <StatusMessage text={historyError} type="error" /> : null}
            {!historyLoading && !history.length ? <EmptyState title="暂无历史" text="完成分析后，后端会把报告保存到 SQLite，并在这里按时间列出。" /> : null}
            <ol className="agent-history-list">
              {history.map((item) => (
                <li key={item.id} className={report?.id === item.id ? "is-active" : undefined}>
                  <button type="button" onClick={() => setAnalysis(item)}>
                    <strong>{item.company || "未命名公司"} · {item.title || "未命名职位"}</strong>
                    <small>{formatDateTime(item.created_at)} · {modeLabel(item.mode)}</small>
                  </button>
                  <span>{item.score}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
