import {
  AlertTriangle,
  BookOpenCheck,
  ClipboardCopy,
  Download,
  History,
  RefreshCcw,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { agentApi, buildSkillRunMarkdown } from "../agentApi";
import type { Analysis, SkillDefinition, SkillRunItemKind, SkillRunResult } from "../agentTypes";
import { EmptyState, PanelTitle, StatusMessage } from "../components";
import "./BusinessSkills.css";

const kindLabels: Record<SkillRunItemKind, string> = {
  fact: "事实摘录",
  proposal: "改写建议",
  study: "学习内容",
  question: "练习问题",
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function modeLabel(mode: string) {
  if (mode === "online" || mode === "ai") return "在线模型";
  if (mode === "degraded") return "降级模式";
  if (mode === "offline") return "离线规则";
  return mode || "未返回";
}

function downloadMarkdown(result: SkillRunResult) {
  const blob = new Blob([buildSkillRunMarkdown(result)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${result.skill_id}-${result.id}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function BusinessSkills({ analysis }: { analysis: Analysis }) {
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsError, setSkillsError] = useState("");
  const [runs, setRuns] = useState<SkillRunResult[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState("");
  const [selectedRun, setSelectedRun] = useState<SkillRunResult | undefined>();
  const [runningSkillId, setRunningSkillId] = useState("");
  const [runError, setRunError] = useState("");
  const [runNotice, setRunNotice] = useState("");
  const [historyLoadingId, setHistoryLoadingId] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const activeRef = useRef(true);

  const sourceMap = useMemo(() => {
    return new Map((selectedRun?.sources ?? []).map((source) => [source.id, source]));
  }, [selectedRun]);

  useEffect(() => {
    let active = true;
    activeRef.current = true;

    setSkillsLoading(true);
    setSkillsError("");
    setRunsLoading(true);
    setRunsError("");
    setRunningSkillId("");
    setRunError("");
    setRunNotice("");
    setSelectedRun(undefined);

    async function loadWorkspace() {
      try {
        const definitions = await agentApi.listSkills();
        if (active) setSkills(definitions);
      } catch (error) {
        if (active) setSkillsError(getErrorMessage(error, "无法读取业务技能列表。"));
      } finally {
        if (active) setSkillsLoading(false);
      }

      try {
        const historyRuns = await agentApi.listSkillRuns(analysis.id);
        if (active) {
          setRuns(historyRuns);
          setSelectedRun(historyRuns[0]);
        }
      } catch (error) {
        if (active) setRunsError(getErrorMessage(error, "无法读取该报告的业务技能历史。"));
      } finally {
        if (active) setRunsLoading(false);
      }
    }

    void loadWorkspace();
    return () => {
      active = false;
      activeRef.current = false;
    };
  }, [analysis.id]);

  async function runSkill(skill: SkillDefinition) {
    setRunningSkillId(skill.id);
    setRunError("");
    setRunNotice("");
    try {
      const result = await agentApi.runSkill(skill.id, { analysis_id: analysis.id });
      if (!activeRef.current) return;
      setSelectedRun(result);
      setRuns((current) => [result, ...current.filter((run) => run.id !== result.id)]);
      setRunNotice(`「${skill.name}」运行完成；结果仅用于人工审阅，不会自动写入简历。`);
    } catch (error) {
      if (!activeRef.current) return;
      setRunError(getErrorMessage(error, `「${skill.name}」运行失败。`));
    } finally {
      if (activeRef.current) setRunningSkillId("");
    }
  }

  async function openHistoryRun(run: SkillRunResult) {
    setHistoryLoadingId(run.id);
    setRunError("");
    try {
      const detail = await agentApi.getSkillRun(run.id);
      if (!activeRef.current) return;
      setSelectedRun(detail);
    } catch (error) {
      if (!activeRef.current) return;
      setRunError(getErrorMessage(error, "打开业务技能历史失败。"));
    } finally {
      if (activeRef.current) setHistoryLoadingId("");
    }
  }

  async function copyMarkdown() {
    if (!selectedRun) return;
    setCopyState("idle");
    try {
      await navigator.clipboard.writeText(buildSkillRunMarkdown(selectedRun));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <section className="panel business-skills" aria-label="业务技能">
      <PanelTitle icon={<BookOpenCheck size={20} />} title="业务技能" />
      <p className="business-skills__intro">
        基于当前分析报告运行受控服务端技能。在线或降级模式可能发起模型请求（含有限重试）并消耗 Token；离线规则模式不调用模型；
        改写和建议只作为人工审阅稿，不会自动替换现有简历。
      </p>

      <div className="business-skills__grid">
        {skillsLoading ? <p className="business-skills__loading">技能列表读取中…</p> : null}
        {skillsError ? <StatusMessage text={skillsError} type="error" /> : null}
        {!skillsLoading && !skillsError && !skills.length ? (
          <EmptyState title="暂无可用业务技能" text="后端技能注册表未返回 jd-diagnosis、resume-tailor 或 interview-prep。" />
        ) : null}
        {skills.map((skill) => (
          <article className="business-skill-card" key={skill.id}>
            <div>
              <strong>{skill.name}</strong>
              <span>{skill.id} · v{skill.version}</span>
            </div>
            <p>{skill.description}</p>
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => void runSkill(skill)}
              disabled={Boolean(runningSkillId)}
            >
              <RefreshCcw size={17} />
              {runningSkillId === skill.id ? "运行中…" : "运行"}
            </button>
          </article>
        ))}
      </div>

      {runningSkillId ? <StatusMessage text="业务技能运行中，请稍候；在线模式可能发起模型请求并消耗 Token，离线规则模式不会调用模型。" type="warning" /> : null}
      {runNotice ? <StatusMessage text={runNotice} type="success" /> : null}
      {runError ? <StatusMessage text={runError} type="error" /> : null}
      {runsLoading ? <p className="business-skills__loading">该报告技能历史读取中…</p> : null}
      {runsError ? <StatusMessage text={runsError} type="error" /> : null}

      {runs.length ? (
        <div className="business-skills__history" aria-label="该分析报告的技能历史">
          <div className="business-skills__history-heading">
            <strong><History size={17} /> 本报告历史</strong>
            <span>{runs.length} 次</span>
          </div>
          <ul>
            {runs.map((run) => (
              <li key={run.id} className={selectedRun?.id === run.id ? "is-active" : undefined}>
                <button type="button" onClick={() => void openHistoryRun(run)} disabled={historyLoadingId === run.id}>
                  <strong>{run.skill_name}</strong>
                  <small>{formatDateTime(run.created_at)} · {modeLabel(run.mode)}</small>
                </button>
                <span>{run.usage.total_tokens} tok</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selectedRun ? (
        <article className="business-skill-result" aria-label={`${selectedRun.skill_name} 运行结果`}>
          <header>
            <div>
              <span>{selectedRun.skill_name} · v{selectedRun.skill_version}</span>
              <h3>{selectedRun.title}</h3>
            </div>
            <div className="business-skill-result__actions">
              <button className="secondary-button compact-button" type="button" onClick={() => void copyMarkdown()}>
                <ClipboardCopy size={17} />
                {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制 Markdown"}
              </button>
              <button className="secondary-button compact-button" type="button" onClick={() => downloadMarkdown(selectedRun)}>
                <Download size={17} />
                下载 Markdown
              </button>
            </div>
          </header>

          <dl className="business-skill-result__meta">
            <div><dt>模式</dt><dd>{modeLabel(selectedRun.mode)}</dd></div>
            <div><dt>模型</dt><dd>{selectedRun.model || "未返回"}</dd></div>
            <div><dt>耗时</dt><dd>{selectedRun.duration_ms} ms</dd></div>
            <div><dt>总 Token</dt><dd>{selectedRun.usage.total_tokens}</dd></div>
            <div><dt>输入 Token</dt><dd>{selectedRun.usage.prompt_tokens}</dd></div>
            <div><dt>输出 Token</dt><dd>{selectedRun.usage.completion_tokens}</dd></div>
            <div><dt>生成时间</dt><dd>{formatDateTime(selectedRun.created_at)}</dd></div>
            <div><dt>报告 ID</dt><dd>{selectedRun.analysis_id}</dd></div>
          </dl>

          {selectedRun.warnings.length ? (
            <div className="business-skill-result__warnings" role="status">
              <AlertTriangle size={17} />
              <ul>{selectedRun.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          ) : null}

          {selectedRun.sections.map((section) => (
            <section key={section.title} aria-label={section.title}>
              <h4>{section.title}</h4>
              <div className="business-skill-items">
                {section.items.map((item, index) => (
                  <article key={`${section.title}-${item.heading}-${index}`}>
                    <div>
                      <strong>{item.heading}</strong>
                      <span>{kindLabels[item.kind]}</span>
                    </div>
                    <p>{item.content}</p>
                    <footer>
                      {item.source_ids.length ? (
                        <small>
                          来源：{item.source_ids.map((sourceId) => sourceMap.get(sourceId)?.title ?? sourceId).join("、")}
                        </small>
                      ) : <small>未声明来源</small>}
                      {item.review_required ? (
                        <em><ShieldAlert size={15} />需人工核实</em>
                      ) : (
                        <em>{item.kind === "fact" ? "来源摘录" : kindLabels[item.kind]}</em>
                      )}
                    </footer>
                  </article>
                ))}
              </div>
            </section>
          ))}

          <section aria-label="业务技能来源">
            <h4>来源</h4>
            <div className="business-skill-sources">
              {selectedRun.sources.map((source) => (
                <details key={source.id}>
                  <summary>{source.title}</summary>
                  <small>ID：{source.id}</small>
                  <p>{source.content}</p>
                </details>
              ))}
            </div>
          </section>
        </article>
      ) : !runsLoading && !runsError ? (
        <EmptyState title="尚无技能结果" text="选择一个业务技能运行，结果会显示来源、Token、模式与需人工核实的内容。" />
      ) : null}
    </section>
  );
}
