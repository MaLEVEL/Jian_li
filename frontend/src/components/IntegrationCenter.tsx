import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Cable,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  PlugZap,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { analyzeMatch } from "../resumeLogic";
import {
  BossIntegrationHealth,
  BossJobRecord,
  ProviderSettings,
  createBossIntegrationApi,
  loadProviderSettings,
  resolveBossApiBaseUrl,
  saveProviderSettings,
  testProviderConnection,
} from "../bossIntegration";
import type { OpportunityRecord, ResumeVersion, SavedJobView, TabId } from "../types";
import {
  OpportunityCenter,
  type OpportunityHandlers,
  type OpportunityCenterRecord,
} from "./OpportunityCenter";
import "./IntegrationCenter.css";

export type IntegrationSection = "funnel" | "guide" | "jobs" | "settings";
const INTEGRATION_SECTIONS: IntegrationSection[] = ["funnel", "guide", "jobs"];
type Notice = { type: "success" | "warning" | "error"; text: string };
const JOB_PAGE_SIZE = 30;

export function IntegrationCenter({
  section,
  selectedResume,
  onSectionChange,
  onGo,
  onUseJob,
  onAddJobToFunnel,
  opportunities,
  savedViews,
  opportunityHandlers,
  onDeleteSavedView,
}: {
  section: IntegrationSection;
  selectedResume?: ResumeVersion;
  onSectionChange: (section: IntegrationSection) => void;
  onGo: (tab: TabId) => void;
  onUseJob: (job: BossJobRecord) => void;
  onAddJobToFunnel: (job: BossJobRecord) => void;
  opportunities: OpportunityCenterRecord[];
  savedViews: SavedJobView[];
  opportunityHandlers: OpportunityHandlers;
  onDeleteSavedView: (viewId: string) => void;
}) {
  const [health, setHealth] = useState<BossIntegrationHealth>();
  const [jobs, setJobs] = useState<BossJobRecord[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestGeneration = useRef(0);
  const [notice, setNotice] = useState<Notice>();
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>(() => loadProviderSettings());
  const [showKey, setShowKey] = useState(false);
  const [testingProvider, setTestingProvider] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const api = useMemo(() => createBossIntegrationApi(), []);
  const rankedJobs = useMemo(() => jobs.map((job) => {
    if (!selectedResume) return { job, score: null, matchedKeywords: [] as string[], missingKeywords: [] as string[] };
    const report = analyzeMatch(
      selectedResume.plainText,
      [job.title, job.description, job.experience, job.education, ...job.tags].join("\n"),
      selectedResume.sections,
    );
    return { job, score: report.score, matchedKeywords: report.matchedKeywords, missingKeywords: report.missingKeywords };
  }).sort((left, right) => (right.score ?? -1) - (left.score ?? -1)), [jobs, selectedResume]);

  async function refreshJobs() {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setLoadingMore(false);
    setNotice(undefined);
    try {
      const [nextHealth, nextPage] = await Promise.all([
        api.getHealth(),
        api.listJobsPage(JOB_PAGE_SIZE, 0),
      ]);
      if (generation !== requestGeneration.current) return;
      setHealth(nextHealth);
      setJobs(nextPage.jobs);
      setTotalJobs(nextPage.total);
      setNextOffset(nextPage.offset + nextPage.jobs.length);
    } catch (error) {
      if (generation === requestGeneration.current) {
        setNotice({ type: "error", text: error instanceof Error ? error.message : "读取 BOSS 职位池失败。" });
      }
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }

  useEffect(() => {
    void refreshJobs();
  }, []);

  function handleSectionKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const currentIndex = INTEGRATION_SECTIONS.indexOf(section);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % INTEGRATION_SECTIONS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + INTEGRATION_SECTIONS.length) % INTEGRATION_SECTIONS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = INTEGRATION_SECTIONS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextSection = INTEGRATION_SECTIONS[nextIndex];
    onSectionChange(nextSection);
    document.getElementById(`integration-tab-${nextSection}`)?.focus();
  }

  async function loadMoreJobs() {
    const generation = requestGeneration.current;
    setLoadingMore(true);
    try {
      const page = await api.listJobsPage(JOB_PAGE_SIZE, nextOffset);
      if (generation !== requestGeneration.current) return;
      setJobs((current) => {
        const known = new Set(current.map((job) => job.id));
        return [...current, ...page.jobs.filter((job) => !known.has(job.id))];
      });
      setTotalJobs(page.total);
      setNextOffset(page.offset + page.jobs.length);
    } catch (error) {
      if (generation === requestGeneration.current) {
        setNotice({ type: "error", text: error instanceof Error ? error.message : "加载更多职位失败。" });
      }
    } finally {
      if (generation === requestGeneration.current) setLoadingMore(false);
    }
  }

  async function saveSettings() {
    try {
      const saved = saveProviderSettings(providerSettings);
      setProviderSettings(saved);
      setNotice({ type: "success", text: "AI 服务配置已保存到当前浏览器；服务端不会持久化密钥。" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "保存 AI 服务配置失败。" });
    }
  }

  async function testConnection() {
    setTestingProvider(true);
    setNotice(undefined);
    try {
      await testProviderConnection(providerSettings);
      const saved = saveProviderSettings(providerSettings);
      setProviderSettings(saved);
      setNotice({ type: "success", text: "API 连接成功，配置已保存在当前浏览器。" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "API 连接测试失败。" });
    } finally {
      setTestingProvider(false);
    }
  }

  async function deleteJob(job: BossJobRecord) {
    if (!window.confirm(`从职位池删除“${job.company} · ${job.title}”吗？BOSS 原页面不会受到影响。`)) return;
    try {
      const deletionGeneration = ++requestGeneration.current;
      setLoadingMore(false);
      await api.deleteJob(job.id);
      if (deletionGeneration !== requestGeneration.current) {
        void refreshJobs();
        return;
      }
      setJobs((current) => current.filter((item) => item.id !== job.id));
      setTotalJobs((current) => Math.max(0, current - 1));
      setNextOffset((current) => Math.max(0, current - 1));
      setHealth((current) => current ? { ...current, count: Math.max(0, current.count - 1) } : current);
      setNotice({ type: "success", text: "职位已从本机职位池删除。" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "删除职位失败。" });
    }
  }

  async function copyExtensionPath() {
    try {
      await navigator.clipboard.writeText("extension");
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  const workflow = [
    { title: "启动服务并安装扩展", text: "先在项目根目录运行 Docker，再按下方步骤加载 extension 文件夹。", action: () => document.getElementById("boss-extension-install")?.scrollIntoView({ behavior: "smooth", block: "start" }), actionLabel: "查看安装步骤", icon: <PlugZap size={20} /> },
    { title: "配置 AI 服务", text: "从页面右上角填写兼容 OpenAI 的地址、模型和密钥；密钥只留在当前浏览器。", action: () => onSectionChange("settings"), icon: <Settings2 size={20} /> },
    { title: "整理真实经历", text: "先在经历库确认项目、技能和工作经历，AI 不会把缺失项写成事实。", action: () => onGo("profile"), icon: <FileText size={20} /> },
    { title: "去 BOSS 采集职位", text: "登录 BOSS、打开搜索结果或职位详情，再点击扩展里的采集按钮。", action: () => window.open("https://www.zhipin.com/web/geek/job", "_blank", "noopener,noreferrer"), icon: <Cable size={20} /> },
    { title: "查看匹配并定制", text: "从职位池带入 JD 匹配，选择更适合的简历版式与内容。", action: () => onGo("optimizer"), icon: <Search size={20} /> },
    { title: "确认后投递", text: "回到 BOSS 人工检查简历与招呼语，再由你点击发送或投递。", action: () => onGo("applications"), icon: <BriefcaseBusiness size={20} /> },
  ];

  return (
    <div className="integration-center">
      <section className="integration-hero" aria-labelledby="integration-title">
        <div>
          <span className="integration-eyebrow"><Cable size={16} /> 机会中心 · BOSS 职位收件箱</span>
          <h2 id="integration-title">先判断什么值得投入，再推进下一步。</h2>
          <p>机会漏斗保存你的判断；BOSS 职位池仍是收件箱。加入漏斗、完成跟进和打开面试包都需要你明确操作。</p>
        </div>
        <div className="integration-health" aria-live="polite">
          <span className={`integration-health__dot ${health ? "is-online" : ""}`} />
          <div>
            <strong>{health ? "本机服务已连接" : loading ? "正在检查服务" : "本机服务未连接"}</strong>
            <small>{health ? `${health.count} 个职位 · ${resolveBossApiBaseUrl()}` : "请先启动 Docker 服务"}</small>
          </div>
          <button className="ghost-button" type="button" onClick={() => void refreshJobs()} disabled={loading}>
            <RefreshCw size={16} className={loading ? "is-spinning" : ""} />
            刷新
          </button>
        </div>
      </section>

      {notice ? (
        <div className={`integration-notice integration-notice--${notice.type}`} role="status">
          {notice.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{notice.text}</span>
        </div>
      ) : null}

      <div className="integration-tabs" role="tablist" aria-label="机会中心页面" onKeyDown={handleSectionKeyDown}>
        {([
          ["funnel", "机会漏斗"],
          ["jobs", `BOSS 职位收件箱${totalJobs ? ` · ${totalJobs}` : ""}`],
          ["guide", "接入说明"],
        ] as const).map(([value, label]) => (
          <button
            aria-controls={`integration-panel-${value}`}
            aria-selected={section === value}
            id={`integration-tab-${value}`}
            key={value}
            role="tab"
            tabIndex={section === value ? 0 : -1}
            type="button"
            onClick={() => onSectionChange(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "funnel" ? (
        <section
          aria-labelledby="integration-tab-funnel"
          className="integration-panel integration-opportunity-panel"
          id="integration-panel-funnel"
          role="tabpanel"
        >
          <OpportunityCenter
            opportunities={opportunities}
            savedViews={savedViews}
            handlers={opportunityHandlers}
            title="今天要推进的机会"
            description="从中筛选、定材料、跟进和准备面试；所有投递与沟通动作仍由你确认。"
          />
          {savedViews.length ? (
            <details className="integration-saved-view-manager">
              <summary>管理已保存筛选视图（{savedViews.length}/5）</summary>
              <div>
                {savedViews.map((view) => (
                  <button key={view.id} type="button" className="ghost-button" onClick={() => onDeleteSavedView(view.id)}>
                    <Trash2 size={15} />删除“{view.name}”
                  </button>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {section === "guide" ? (
        <section aria-labelledby="integration-tab-guide" className="integration-panel integration-guide" id="integration-panel-guide" role="tabpanel">
          <div className="integration-section-heading">
            <div><span>首次配置约 5 分钟</span><h3>从安装扩展到完成第一次匹配</h3></div>
            <button className="secondary-button" type="button" onClick={() => void copyExtensionPath()}>
              <Clipboard size={16} />
              {copyState === "copied" ? "已复制 extension" : copyState === "failed" ? "复制失败" : "复制扩展目录名"}
            </button>
          </div>
          <span className="integration-live" aria-live="polite">
            {copyState === "copied" ? "扩展目录名已复制。" : copyState === "failed" ? "扩展目录名复制失败。" : ""}
          </span>

          <div className="integration-steps">
            {workflow.map((item, index) => (
              <article key={item.title}>
                <span className="integration-step-number">{String(index + 1).padStart(2, "0")}</span>
                <div className="integration-step-icon">{item.icon}</div>
                <div><strong>{item.title}</strong><p>{item.text}</p></div>
                <button className="text-button" type="button" onClick={item.action}>
                  {item.actionLabel ?? "前往"} <ArrowRight size={15} />
                </button>
              </article>
            ))}
          </div>

          <div className="integration-install" id="boss-extension-install">
            <div>
              <span className="integration-install__label">加载未打包扩展</span>
              <ol>
                <li>打开 Chrome 或 Edge 的扩展管理页，并开启“开发者模式”。这只是加载本地扩展的浏览器开关，不需要编程。</li>
                <li>选择“加载已解压的扩展程序”，指向项目根目录下的 <code>extension</code> 文件夹。</li>
                <li>打开 BOSS 直聘搜索结果或职位详情，点击“职启云帆 BOSS 职位采集器”。</li>
                <li>确认服务地址为 <code>http://127.0.0.1:18001</code>，先测试连接，再采集当前页。</li>
              </ol>
            </div>
            <div className="integration-boundary">
              <ShieldCheck size={22} />
              <strong>数据边界</strong>
              <p>扩展只读取你已经打开页面中的可见职位，不读取密码、聊天或其他标签页。最终投递必须由你本人确认。</p>
            </div>
          </div>

          <div className="integration-shortcuts">
            <button type="button" onClick={() => onGo("profile")}><FileText size={18} /><span><strong>先完善经历库</strong><small>匹配需要真实素材</small></span></button>
            <button type="button" onClick={() => onGo("templates")}><Sparkles size={18} /><span><strong>选择简历版式</strong><small>切换不会丢失内容</small></span></button>
            <button type="button" onClick={() => onGo("applications")}><BriefcaseBusiness size={18} /><span><strong>查看投递记录</strong><small>跟进每一次机会</small></span></button>
          </div>
        </section>
      ) : null}

      {section === "jobs" ? (
        <section aria-labelledby="integration-tab-jobs" className="integration-panel" id="integration-panel-jobs" role="tabpanel">
          <div className="integration-section-heading">
            <div><span>本机 SQLite 职位池 · 已加载 {jobs.length} / {totalJobs}</span><h3>收到的 BOSS 岗位</h3></div>
            <button className="secondary-button" type="button" onClick={() => void refreshJobs()} disabled={loading}>
              <RefreshCw size={16} className={loading ? "is-spinning" : ""} />刷新职位池
            </button>
          </div>

          {!rankedJobs.length && !loading ? (
            <div className="integration-empty">
              <Cable size={30} />
              <strong>职位池还是空的</strong>
              <p>在 BOSS 页面打开搜索结果或职位详情，然后点击浏览器扩展里的“采集当前页”。</p>
              <button className="primary-button" type="button" onClick={() => onSectionChange("guide")}>查看接入教程</button>
            </div>
          ) : (
            <div className="integration-job-list" aria-live="polite">
              {rankedJobs.map(({ job, score, matchedKeywords, missingKeywords }) => (
                <article className="integration-job" key={job.id}>
                  <div className="integration-job__top">
                    <div>
                      <span>{job.company || "未知公司"} · {job.source === "boss" ? "BOSS" : job.source}</span>
                      <h4>{job.title || "未命名岗位"}</h4>
                    </div>
                    <div className="integration-job__compensation">
                      {score !== null ? (
                        <span className="integration-job__score" aria-label={`本地匹配分 ${Math.round(score)}`}>
                          匹配 {score.toFixed(1)}
                        </span>
                      ) : null}
                      <strong>{job.salary || "薪资未公开"}</strong>
                      <small>{job.location || "地点未公开"}</small>
                    </div>
                  </div>
                  <div className="integration-job__meta">
                    {[job.experience, job.education, ...job.tags].filter(Boolean).map((item) => <span key={item}>{item}</span>)}
                    {matchedKeywords.slice(0, 5).map((item) => <span className="is-match" key={`match-${item}`}>已具备 · {item}</span>)}
                    {missingKeywords.slice(0, 4).map((item) => <span className="is-gap" key={`gap-${item}`}>待补 · {item}</span>)}
                  </div>
                  <p>{job.description || "扩展没有读取到职位描述，请打开 BOSS 详情页重新采集。"}</p>
                  <div className="integration-job__actions">
                    <button className="primary-button" type="button" onClick={() => onAddJobToFunnel(job)}>
                      <Target size={16} />加入机会漏斗
                    </button>
                    <button className="secondary-button" type="button" onClick={() => onUseJob(job)}>
                      <Search size={16} />用这份 JD 匹配
                    </button>
                    <button className="secondary-button" type="button" onClick={() => onGo("builder")}>
                      <FileText size={16} />编辑简历
                    </button>
                    <a className="ghost-button" href={job.source_url} target="_blank" rel="noreferrer">
                      <ExternalLink size={16} />回到 BOSS
                    </a>
                    <button className="ghost-button integration-delete" type="button" onClick={() => void deleteJob(job)} aria-label={`删除 ${job.company} ${job.title}`}>
                      <Trash2 size={16} />删除
                    </button>
                  </div>
                  <small className="integration-job__time">采集于 {new Date(job.fetched_at || job.updated_at).toLocaleString("zh-CN")}</small>
                </article>
              ))}
            </div>
          )}
          {rankedJobs.length > 0 && nextOffset < totalJobs ? (
            <button className="secondary-button integration-load-more" type="button" onClick={() => void loadMoreJobs()} disabled={loadingMore}>
              <RefreshCw size={16} className={loadingMore ? "is-spinning" : ""} />
              {loadingMore ? "正在加载" : `加载更多（还有 ${Math.max(0, totalJobs - jobs.length)} 个）`}
            </button>
          ) : null}
        </section>
      ) : null}

      {section === "settings" ? (
        <section aria-label="AI 服务配置" className="integration-panel" id="integration-panel-settings" role="tabpanel">
          <div className="integration-section-heading">
            <div><span>只保存在当前浏览器 · 从页面右上角进入</span><h3>AI 服务配置</h3></div>
            <span className="integration-lock"><ShieldCheck size={15} />不进入服务器数据库</span>
          </div>
          <form className="integration-settings" onSubmit={(event) => { event.preventDefault(); void saveSettings(); }}>
            <label className="integration-settings__wide">
              <span>请求地址</span>
              <input aria-label="请求地址" type="url" required value={providerSettings.baseUrl} onChange={(event) => setProviderSettings((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://open.bigmodel.cn/api/paas/v4" />
              <small>填写 OpenAI 兼容接口的 API Base URL，不要包含 `/chat/completions`。</small>
            </label>
            <label>
              <span>模型名称</span>
              <input aria-label="模型名称" required value={providerSettings.model} onChange={(event) => setProviderSettings((current) => ({ ...current, model: event.target.value }))} placeholder="glm-4-flash" />
            </label>
            <label>
              <span>API Key</span>
              <div className="integration-secret">
                <input aria-label="API Key" required type={showKey ? "text" : "password"} autoComplete="off" value={providerSettings.apiKey} onChange={(event) => setProviderSettings((current) => ({ ...current, apiKey: event.target.value }))} placeholder="仅保存在当前浏览器" />
                <button type="button" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}>{showKey ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </label>
            <div className="integration-settings__actions">
              <button className="secondary-button" type="button" onClick={() => void testConnection()} disabled={testingProvider}>
                <PlugZap size={16} />{testingProvider ? "测试中…" : "保存并测试连接"}
              </button>
              <button className="primary-button" type="submit">保存到当前浏览器</button>
            </div>
          </form>
          <div className="integration-security-note">
            <ShieldCheck size={20} />
            <div><strong>密钥处理方式</strong><p>密钥保存在当前浏览器，不会写入 SQLite、服务端日志或 Git。浏览器扩展只连接本机职位接口，不需要模型密钥。</p></div>
          </div>
        </section>
      ) : null}

      {selectedResume ? <p className="integration-current-resume">当前匹配版本：{selectedResume.title}</p> : <p className="integration-current-resume">还没有简历版本。请先完善经历库并生成基础简历。</p>}
    </div>
  );
}
