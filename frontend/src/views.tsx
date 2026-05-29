import {
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardPaste,
  Copy,
  Download,
  Eraser,
  FileText,
  Gauge,
  Library,
  RefreshCcw,
  Save,
  Search,
  Sparkles,
  Target,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { RESUME_TEMPLATE_OPTIONS, STATUS_OPTIONS } from "./constants";
import { EmptyState, Field, MetricCard, PanelTitle, TextArea } from "./components";
import {
  formatDate,
  getOrderedResumeSections,
  getResumeIdentity,
  inspectResumeQuality,
  splitLines,
  splitSkills,
} from "./resumeLogic";
import type {
  ApplicationRecord,
  ApplicationStatus,
  CandidateProfile,
  JobDraft,
  MatchReport,
  MatchPreview,
  ResumeContentPatch,
  ResumeIdentity,
  ResumeImportDraft,
  ResumeQualityReport,
  ResumeTemplate,
  ResumeSections,
  ResumeVersion,
  TabId,
} from "./types";

function isApplicationStatus(value: string): value is ApplicationStatus {
  return STATUS_OPTIONS.some((option) => option.value === value);
}

function isResumeTemplate(value: string): value is ResumeTemplate {
  return RESUME_TEMPLATE_OPTIONS.some((option) => option.value === value);
}

export function WorkspaceView({
  applications,
  latestApplication,
  profile,
  resumes,
  onGenerate,
  onGo,
  onLoadSampleUser,
  onRunDemoFlow,
}: {
  applications: ApplicationRecord[];
  latestApplication?: ApplicationRecord;
  profile: CandidateProfile;
  resumes: ResumeVersion[];
  onGenerate: () => void;
  onGo: (tab: TabId) => void;
  onLoadSampleUser: () => void;
  onRunDemoFlow: () => void;
}) {
  const hasResume = resumes.length > 0;
  const hasApplication = applications.length > 0;
  const activeStepIndex = hasApplication ? 3 : hasResume ? 2 : 0;
  const primaryAction = hasApplication
    ? { icon: <BriefcaseBusiness size={18} />, label: "查看投递跟进", onClick: () => onGo("applications") }
    : hasResume
      ? { icon: <Target size={18} />, label: "去 JD 匹配", onClick: () => onGo("optimizer") }
      : { icon: <Library size={18} />, label: "完善经历库", onClick: () => onGo("profile") };
  const flowSteps: Array<{ label: string; text: string; tab: TabId }> = [
    { label: "完善经历库", text: profile.name && profile.targetRole ? `${profile.name} · ${profile.targetRole}` : "先补齐个人经历素材", tab: "profile" },
    { label: "生成/导入简历", text: hasResume ? `${resumes.length} 份简历版本` : "生成或粘贴已有简历", tab: "builder" },
    { label: "JD 匹配", text: latestApplication ? `最近 ${latestApplication.report.score} 分` : "粘贴岗位 JD 做适配", tab: "optimizer" },
    { label: "投递跟进", text: hasApplication ? `${applications.length} 条投递记录` : "保存状态、渠道和提醒", tab: "applications" },
  ];

  return (
    <div className="stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Resume Workflow</p>
          <h2>把简历版本、JD 匹配和投递跟进串成一条线。</h2>
          <p>
            数据只保存在当前浏览器。先整理经历，再生成或导入简历，最后围绕岗位做匹配和跟进。
          </p>
        </div>
        <div className="hero-actions hero-actions--single">
          <button className="primary-button" type="button" onClick={primaryAction.onClick}>
            {primaryAction.icon}
            {primaryAction.label}
          </button>
        </div>
      </section>

      <section className="workflow-panel" aria-label="求职流程进度">
        <div className="workflow-heading">
          <PanelTitle icon={<Library size={20} />} title="流程进度" />
          <button className="secondary-button compact-button" type="button" onClick={onGenerate}>
            <Sparkles size={17} />
            从经历库生成
          </button>
        </div>
        <div className="workflow-steps">
          {flowSteps.map((step, index) => {
            const state = index < activeStepIndex ? "done" : index === activeStepIndex ? "active" : "idle";
            return (
              <button className={`workflow-step workflow-step--${state}`} key={step.label} type="button" onClick={() => onGo(step.tab)}>
                <span className="workflow-step__index">{index + 1}</span>
                <strong>{step.label}</strong>
                <small>{step.text}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="workspace-summary" aria-label="当前求职状态">
        <article>
          <span>目标岗位</span>
          <strong>{profile.targetRole || "未填写"}</strong>
        </article>
        <article>
          <span>简历版本</span>
          <strong>{resumes.length} 份</strong>
        </article>
        <article>
          <span>投递记录</span>
          <strong>{applications.length} 条</strong>
        </article>
        <article>
          <span>最近匹配分</span>
          <strong>{latestApplication ? latestApplication.report.score : "待分析"}</strong>
        </article>
        <details className="demo-drawer">
          <summary>演示与样例</summary>
          <div>
            <button className="secondary-button" type="button" onClick={onLoadSampleUser}>
              <User size={17} />
              载入示例用户
            </button>
            <button className="secondary-button" type="button" onClick={onRunDemoFlow}>
              <BarChart3 size={17} />
              演示完整流程
            </button>
          </div>
        </details>
      </section>
    </div>
  );
}

export function ProfileView({
  profile,
  setProfileTemplate,
  updateProfile,
  onGenerate,
}: {
  profile: CandidateProfile;
  setProfileTemplate: (patch: Partial<CandidateProfile>) => void;
  updateProfile: (field: keyof CandidateProfile) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onGenerate: () => void;
}) {
  const templateAction = (field: keyof CandidateProfile, value: string) => (
    <button className="inline-help-button" type="button" onClick={() => setProfileTemplate({ [field]: value })}>
      填入模板
    </button>
  );

  return (
    <section className="panel">
      <PanelTitle icon={<Library size={20} />} title="经历库" />
      <div className="profile-guide">
        <strong>填写建议</strong>
        <p>每段经历建议按“名称｜角色｜时间｜动作 + 技术/方法 + 结果”写。先写真实事实，生成后再做岗位适配。</p>
      </div>
      <div className="profile-grid">
        <Field label="姓名" placeholder="例如：李同学" value={profile.name} onChange={updateProfile("name")} />
        <Field label="邮箱" placeholder="例如：li@example.com" value={profile.email} onChange={updateProfile("email")} />
        <Field label="电话" placeholder="例如：138-0000-0000" value={profile.phone} onChange={updateProfile("phone")} />
        <Field label="城市" placeholder="例如：上海" value={profile.location} onChange={updateProfile("location")} />
        <Field
          label="目标岗位"
          help="写你当前最想投递的岗位名称，后续生成和匹配都会围绕它展开。"
          placeholder="例如：产品助理实习生 / 前端开发工程师"
          value={profile.targetRole}
          onChange={updateProfile("targetRole")}
          wide
        />
        <Field
          label="一句话定位"
          help="一句话说清专业背景、目标方向和最能证明你的能力。"
          placeholder="例如：信息管理专业应届生，熟悉用户调研、原型设计和数据分析。"
          value={profile.headline}
          onChange={updateProfile("headline")}
          wide
        />
        <TextArea
          action={templateAction("education", "某某大学｜信息管理与信息系统｜本科｜2022.09 - 2026.06｜GPA 3.6/4.0")}
          help="格式：学校｜专业｜学历｜时间｜可选成绩/课程。"
          label="教育经历"
          placeholder="某某大学｜信息管理与信息系统｜本科｜2022.09 - 2026.06｜主修：数据库、产品设计、统计分析"
          value={profile.education}
          onChange={updateProfile("education")}
        />
        <TextArea
          action={templateAction("skills", "Axure, SQL, Excel, 用户调研, 数据分析, 原型设计, PRD, 墨刀")}
          help="用逗号或换行分隔，尽量写 JD 会搜索到的工具、方法和技术词。"
          label="技能关键词"
          placeholder="Axure, SQL, Excel, 用户调研, 数据分析, 原型设计"
          value={profile.skills}
          onChange={updateProfile("skills")}
        />
        <TextArea
          action={templateAction(
            "projects",
            "校园活动小程序｜产品负责人｜2025.03 - 2025.06｜完成用户访谈 12 人，梳理报名/签到流程，输出原型和 PRD，推动开发上线活动报名、提醒和数据看板功能。",
          )}
          help="每行一个项目。格式：项目名｜角色｜时间｜做了什么｜用了什么方法/工具｜产生什么结果。"
          label="项目经历"
          placeholder="校园活动小程序｜产品负责人｜2025.03 - 2025.06｜完成用户访谈 12 人，输出原型和 PRD，推动报名流程从 5 步缩短到 3 步。"
          value={profile.projects}
          onChange={updateProfile("projects")}
          tall
        />
        <TextArea
          action={templateAction(
            "experience",
            "产品运营实习生｜某科技公司｜2025.07 - 2025.10｜整理用户反馈 200+ 条，使用 Excel/SQL 分析转化漏斗，协助优化新手引导文案。",
          )}
          help="每行一段实习/工作经历。尽量写动作和结果，不只写“负责/参与”。"
          label="实习/工作经历"
          placeholder="产品运营实习生｜某科技公司｜2025.07 - 2025.10｜整理用户反馈 200+ 条，分析转化漏斗，协助优化新手引导。"
          value={profile.experience}
          onChange={updateProfile("experience")}
          tall
        />
        <TextArea
          action={templateAction("awards", "校级优秀课程设计｜英语四级｜互联网+ 校赛三等奖")}
          help="证书、奖项、竞赛、作品集都可以放这里；没有可以先留空。"
          label="证书/奖项"
          placeholder="校级优秀课程设计｜英语四级｜互联网+ 校赛三等奖"
          value={profile.awards}
          onChange={updateProfile("awards")}
        />
      </div>
      <button className="primary-button form-submit" type="button" onClick={onGenerate}>
        <Sparkles size={18} />
        用经历库生成简历
      </button>
    </section>
  );
}

export function BuilderView({
  importDraft,
  pasteText,
  pasteTitle,
  profile,
  renameDraft,
  resumes,
  selectedResume,
  onCopy,
  onDelete,
  onExport,
  onExportPdf,
  onGenerate,
  onGo,
  onCancelImport,
  onConfirmImport,
  onImportDraftChange,
  onMarkReviewed,
  onPreviewImport,
  onRename,
  onSelectResume,
  onTemplateChange,
  onUpdateResume,
  setPasteText,
  setPasteTitle,
  setRenameDraft,
}: {
  importDraft?: ResumeImportDraft;
  pasteText: string;
  pasteTitle: string;
  profile: CandidateProfile;
  renameDraft: string;
  resumes: ResumeVersion[];
  selectedResume?: ResumeVersion;
  onCopy: (resume: ResumeVersion) => void;
  onDelete: (id: string) => void;
  onExport: (resume: ResumeVersion) => void;
  onExportPdf: (resume: ResumeVersion) => void;
  onGenerate: () => void;
  onGo: (tab: TabId) => void;
  onCancelImport: () => void;
  onConfirmImport: () => void;
  onImportDraftChange: (draft: ResumeImportDraft) => void;
  onMarkReviewed: (id: string, reviewed: boolean) => void;
  onPreviewImport: () => void;
  onRename: (id: string) => void;
  onSelectResume: (id: string) => void;
  onTemplateChange: (id: string, template: ResumeTemplate) => void;
  onUpdateResume: (id: string, patch: ResumeContentPatch) => void;
  setPasteText: (value: string) => void;
  setPasteTitle: (value: string) => void;
  setRenameDraft: (value: string) => void;
}) {
  const qualityReport = selectedResume ? inspectResumeQuality(selectedResume) : undefined;
  const selectedTemplateOption = selectedResume
    ? RESUME_TEMPLATE_OPTIONS.find((option) => option.value === selectedResume.template)
    : undefined;
  const [mobileTab, setMobileTab] = useState<"versions" | "editor" | "preview">("versions");
  const switchToEditor = () => setMobileTab("editor");
  const switchToPreview = () => setMobileTab("preview");

  return (
    <div className="builder-layout">
      <div className="builder-mobile-tabs" role="tablist" aria-label="简历版本页分区">
        <button className={mobileTab === "versions" ? "builder-mobile-tab--active" : ""} type="button" onClick={() => setMobileTab("versions")}>
          版本
        </button>
        <button className={mobileTab === "editor" ? "builder-mobile-tab--active" : ""} type="button" onClick={() => setMobileTab("editor")}>
          编辑
        </button>
        <button className={mobileTab === "preview" ? "builder-mobile-tab--active" : ""} type="button" onClick={() => setMobileTab("preview")}>
          预览
        </button>
      </div>

      <section className={`builder-pane builder-pane--versions ${mobileTab === "versions" ? "builder-pane--active" : ""}`}>
        <div className="builder-pane__heading">
          <PanelTitle icon={<FileText size={20} />} title="版本管理" />
        </div>
        <div className="version-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              onGenerate();
              switchToEditor();
            }}
          >
            <Sparkles size={18} />
            新建
          </button>
        </div>

        <div className="import-panel">
          <strong>导入已有简历</strong>
          <input value={pasteTitle} onChange={(event) => setPasteTitle(event.target.value)} placeholder="版本名称" />
          <textarea
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder="粘贴简历文本"
          />
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              onPreviewImport();
              if (pasteText.trim()) {
                switchToEditor();
              }
            }}
          >
            <Upload size={17} />
            识别
          </button>
        </div>

        <div className="resume-list">
          {resumes.length ? (
            resumes.map((resume) => (
              <button
                className={`resume-item ${selectedResume?.id === resume.id ? "resume-item--active" : ""}`}
                key={resume.id}
                type="button"
                onClick={() => {
                  onSelectResume(resume.id);
                  switchToEditor();
                }}
              >
                <strong>{resume.title}</strong>
                <span>
                  {resume.source === "optimized" ? "岗位定制" : resume.source === "uploaded" ? "文本导入" : "基础生成"} ·{" "}
                  {formatDate(resume.updatedAt)}
                </span>
              </button>
            ))
          ) : (
            <EmptyState title="还没有简历" text="先新建，或导入已有简历文本。" />
          )}
        </div>
        {selectedResume ? (
          <button className="destructive-button version-delete-button" type="button" onClick={() => onDelete(selectedResume.id)}>
            <Trash2 size={17} />
            删除当前版本
          </button>
        ) : null}
      </section>

      <section className={`builder-pane builder-pane--editor ${mobileTab === "editor" ? "builder-pane--active" : ""}`}>
        {importDraft ? (
          <ImportReviewPanel
            draft={importDraft}
            onCancel={() => {
              onCancelImport();
              setMobileTab(selectedResume ? "editor" : "versions");
            }}
            onChange={onImportDraftChange}
            onConfirm={() => {
              onConfirmImport();
              switchToPreview();
            }}
          />
        ) : selectedResume ? (
          <>
            <div className="edit-header">
              <div>
                <p className="eyebrow">{selectedResume.source}</p>
                <div className="title-editor">
                  <input value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} />
                  <button className="secondary-button icon-button" type="button" onClick={() => onRename(selectedResume.id)} title="保存名称">
                    <Save size={17} />
                  </button>
                </div>
              </div>
              <label className="template-picker">
                <span>模板</span>
                <select
                  value={selectedResume.template}
                  onChange={(event) => {
                    const nextTemplate = event.currentTarget.value;
                    if (isResumeTemplate(nextTemplate)) {
                      onTemplateChange(selectedResume.id, nextTemplate);
                    }
                  }}
                >
                  {RESUME_TEMPLATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <small>{selectedTemplateOption?.description}</small>
              </label>
            </div>
            <ResumeEditor profile={profile} resume={selectedResume} onUpdateResume={onUpdateResume} />
            {qualityReport ? (
              <QualityPanel report={qualityReport} />
            ) : null}
            <ReviewNotice resume={selectedResume} onMarkReviewed={onMarkReviewed} />
          </>
        ) : (
          <EmptyState title="等待选择" text="先在左侧新建、导入或选择一个简历版本。" />
        )}
      </section>

      <section className={`builder-pane builder-pane--preview ${mobileTab === "preview" ? "builder-pane--active" : ""}`}>
        {selectedResume ? (
          <>
            <div className="preview-actions">
              <button className="secondary-button" type="button" onClick={() => onCopy(selectedResume)}>
                <Copy size={17} />
                复制
              </button>
              <button className="secondary-button" type="button" onClick={() => onExport(selectedResume)}>
                <Download size={17} />
                下载 .docx
              </button>
              <button className="secondary-button" type="button" onClick={() => onExportPdf(selectedResume)}>
                <Download size={17} />
                打印 PDF
              </button>
              <button className="primary-button" type="button" onClick={() => onGo("optimizer")}>
                <Target size={17} />
                去 JD 匹配
              </button>
            </div>
            <ResumePaper profile={profile} resume={selectedResume} />
          </>
        ) : (
          <EmptyState title="暂无预览" text="选择或保存一个简历版本后，这里会显示 A4 预览。" />
        )}
      </section>
    </div>
  );
}

function ImportReviewPanel({
  draft,
  onCancel,
  onChange,
  onConfirm,
}: {
  draft: ResumeImportDraft;
  onCancel: () => void;
  onChange: (draft: ResumeImportDraft) => void;
  onConfirm: () => void;
}) {
  const updateIdentity = (patch: Partial<ResumeIdentity>) => {
    onChange({ ...draft, identity: { ...draft.identity, ...patch } });
  };
  const updateSections = (patch: Partial<ResumeSections>) => {
    onChange({ ...draft, sections: { ...draft.sections, ...patch } });
  };

  return (
    <section className="import-review" aria-label="确认导入识别结果">
      <PanelTitle icon={<FileText size={20} />} title="确认识别结果" />
      <p>系统已经把粘贴文本拆成简历字段。请先改错姓名、联系方式和经历归类，再保存为正式版本。</p>
      <div className="resume-editor__identity-grid">
        <label>
          <span>版本名称</span>
          <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} />
        </label>
        <label>
          <span>姓名</span>
          <input value={draft.identity.name} onChange={(event) => updateIdentity({ name: event.target.value })} />
        </label>
        <label>
          <span>手机号</span>
          <input value={draft.identity.phone} onChange={(event) => updateIdentity({ phone: event.target.value })} />
        </label>
        <label>
          <span>邮箱</span>
          <input value={draft.identity.email} onChange={(event) => updateIdentity({ email: event.target.value })} />
        </label>
        <label>
          <span>城市</span>
          <input value={draft.identity.location} onChange={(event) => updateIdentity({ location: event.target.value })} />
        </label>
        <label>
          <span>求职意向</span>
          <input value={draft.targetRole} onChange={(event) => onChange({ ...draft, targetRole: event.target.value })} />
        </label>
      </div>
      <label>
        <span>个人总结</span>
        <textarea value={draft.sections.summary} onChange={(event) => updateSections({ summary: event.target.value })} />
      </label>
      <label>
        <span>技能（逗号或换行分隔）</span>
        <textarea value={draft.sections.skills.join(", ")} onChange={(event) => updateSections({ skills: splitSkills(event.target.value) })} />
      </label>
      <label>
        <span>教育经历（每行一条）</span>
        <textarea value={draft.sections.education.join("\n")} onChange={(event) => updateSections({ education: splitLines(event.target.value) })} />
      </label>
      <label>
        <span>项目经历（每行一条）</span>
        <textarea value={draft.sections.projects.join("\n")} onChange={(event) => updateSections({ projects: splitLines(event.target.value) })} />
      </label>
      <label>
        <span>实习/工作经历（每行一条）</span>
        <textarea value={draft.sections.experience.join("\n")} onChange={(event) => updateSections({ experience: splitLines(event.target.value) })} />
      </label>
      <label>
        <span>证书/奖项（每行一条）</span>
        <textarea value={draft.sections.awards.join("\n")} onChange={(event) => updateSections({ awards: splitLines(event.target.value) })} />
      </label>
      <div className="import-review__actions">
        <button className="primary-button" type="button" onClick={onConfirm}>
          <Upload size={17} />
          保存为简历版本
        </button>
        <button className="secondary-button" type="button" onClick={onCancel}>
          <Eraser size={17} />
          取消确认
        </button>
      </div>
    </section>
  );
}

export function OptimizerView({
  applications,
  jobDraft,
  matchPreview,
  resumes,
  selectedResume,
  setJobDraft,
  onAnalyze,
  onClearJob,
  onGenerateCustomizedResume,
  onPasteJobDescription,
  onSaveApplication,
  onSelectResume,
  onUseSampleJob,
}: {
  applications: ApplicationRecord[];
  jobDraft: JobDraft;
  matchPreview?: MatchPreview;
  resumes: ResumeVersion[];
  selectedResume?: ResumeVersion;
  setJobDraft: (draft: JobDraft) => void;
  onAnalyze: (event: FormEvent<HTMLFormElement>) => void;
  onClearJob: () => void;
  onGenerateCustomizedResume: () => void;
  onPasteJobDescription: () => void;
  onSaveApplication: () => void;
  onSelectResume: (id: string) => void;
  onUseSampleJob: () => void;
}) {
  const latest = applications[0];
  const visibleReport = matchPreview ?? latest;
  const reportTitle = matchPreview ? "当前匹配报告" : latest ? "最近一次已保存报告" : "报告区";
  return (
    <div className="optimizer-grid">
      <section className="panel">
        <PanelTitle icon={<Search size={20} />} title="JD 输入区" />
        {selectedResume ? (
          <div className="current-selection">
            <span>当前用于匹配的简历</span>
            <strong>{selectedResume.title}</strong>
          </div>
        ) : null}
        <form className="jd-form" onSubmit={onAnalyze}>
          <label>
            <span>选择简历版本</span>
            <select value={selectedResume?.id ?? ""} onChange={(event) => onSelectResume(event.target.value)}>
              {resumes.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.title}
                </option>
              ))}
            </select>
          </label>
          <div className="jd-quick-actions" aria-label="JD 快速操作">
            <button className="secondary-button" type="button" onClick={onUseSampleJob}>
              <FileText size={17} />
              使用示例 JD
            </button>
            <button className="secondary-button" type="button" onClick={onPasteJobDescription}>
              <ClipboardPaste size={17} />
              粘贴剪贴板内容
            </button>
            <button className="secondary-button" type="button" onClick={onClearJob}>
              <Eraser size={17} />
              清空 JD
            </button>
          </div>
          <Field label="公司名" value={jobDraft.company} onChange={(event) => setJobDraft({ ...jobDraft, company: event.target.value })} />
          <Field label="岗位名" value={jobDraft.title} onChange={(event) => setJobDraft({ ...jobDraft, title: event.target.value })} />
          <TextArea
            label="岗位 JD"
            value={jobDraft.description}
            onChange={(event) => setJobDraft({ ...jobDraft, description: event.target.value })}
            tall
          />
          <button className="primary-button form-submit" type="submit">
            <Gauge size={18} />
            生成匹配报告
          </button>
        </form>
      </section>

      <section className="panel">
        <PanelTitle icon={<Target size={20} />} title={reportTitle} />
        {visibleReport ? (
          <>
            <ReportView
              job={visibleReport.job}
              report={visibleReport.report}
              resumeTitle={visibleReport.resumeTitle}
              updatedAt={visibleReport.updatedAt}
            />
            {matchPreview ? (
              <div className="report-actions">
                <button className="secondary-button" type="button" onClick={onSaveApplication}>
                  <Save size={17} />
                  保存为投递记录
                </button>
                <button className="primary-button" type="button" onClick={onGenerateCustomizedResume}>
                  <Sparkles size={17} />
                  生成定制版简历
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState title="暂无报告" text="粘贴 JD 后会在这里显示匹配分、优势和缺口。" />
        )}
      </section>
    </div>
  );
}

export function ApplicationsView({
  applications,
  resumes,
  onDelete,
  onDetailsChange,
  onRecalculate,
  onStatusChange,
}: {
  applications: ApplicationRecord[];
  resumes: ResumeVersion[];
  onDelete: (id: string) => void;
  onDetailsChange: (
    id: string,
    patch: Partial<Pick<ApplicationRecord, "appliedAt" | "channel" | "hrContact" | "followUpAt" | "interviewAt" | "notes">>,
  ) => void;
  onRecalculate: (id: string) => void;
  onStatusChange: (id: string, status: ApplicationStatus) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const resumeLookup = useMemo(() => new Map(resumes.map((resume) => [resume.id, resume])), [resumes]);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const upcomingFollowUps = useMemo(
    () =>
      applications
        .filter((application) => application.followUpAt)
        .sort((left, right) => new Date(left.followUpAt).getTime() - new Date(right.followUpAt).getTime())
        .slice(0, 3),
    [applications],
  );
  const upcomingInterviews = useMemo(
    () =>
      applications
        .filter((application) => application.interviewAt)
        .sort((left, right) => new Date(left.interviewAt).getTime() - new Date(right.interviewAt).getTime())
        .slice(0, 3),
    [applications],
  );
  const channelStats = useMemo(() => {
    const counts = applications.reduce<Record<string, number>>((result, application) => {
      const channel = application.channel && application.channel !== "未记录" ? application.channel : "未记录";
      result[channel] = (result[channel] ?? 0) + 1;
      return result;
    }, {});
    return Object.entries(counts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"))
      .slice(0, 4);
  }, [applications]);
  const visibleApplications = useMemo(
    () =>
      applications.filter((application) => {
        const matchesStatus = statusFilter === "all" || application.status === statusFilter;
        const searchable = [
          application.job.company,
          application.job.title,
          application.resumeTitle,
          application.channel,
          application.notes,
        ]
          .join(" ")
          .toLowerCase();
        return matchesStatus && (!normalizedSearch || searchable.includes(normalizedSearch));
      }),
    [applications, normalizedSearch, statusFilter],
  );

  return (
    <section className="panel">
      <PanelTitle icon={<BriefcaseBusiness size={20} />} title="投递管理" />
      {applications.length ? (
        <>
          <div className="crm-summary-grid">
            <article className="crm-summary-card">
              <div>
                <CalendarClock size={18} />
                <strong>跟进提醒</strong>
              </div>
              {upcomingFollowUps.length ? (
                <ul>
                  {upcomingFollowUps.map((application) => (
                    <li key={`follow-${application.id}`}>
                      <span>{formatDate(application.followUpAt)}</span>
                      <strong>{application.job.company}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>暂无跟进提醒。</p>
              )}
            </article>
            <article className="crm-summary-card">
              <div>
                <BriefcaseBusiness size={18} />
                <strong>面试日程</strong>
              </div>
              {upcomingInterviews.length ? (
                <ul>
                  {upcomingInterviews.map((application) => (
                    <li key={`interview-${application.id}`}>
                      <span>{formatDate(application.interviewAt)}</span>
                      <strong>{application.job.company}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>暂无面试安排。</p>
              )}
            </article>
            <article className="crm-summary-card">
              <div>
                <BarChart3 size={18} />
                <strong>渠道统计</strong>
              </div>
              {channelStats.length ? (
                <ul>
                  {channelStats.map(([channel, count]) => (
                    <li key={channel}>
                      <span>{channel}</span>
                      <strong>{count} 条</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>暂无渠道数据。</p>
              )}
            </article>
          </div>
          <div className="application-filter-bar">
            <label>
              <span>搜索公司/岗位</span>
              <input
                value={searchTerm}
                placeholder="输入公司、岗位、渠道或备注"
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
            <label>
              <span>状态筛选</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  const nextStatus = event.currentTarget.value;
                  setStatusFilter(isApplicationStatus(nextStatus) ? nextStatus : "all");
                }}
              >
                <option value="all">全部状态</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <strong>
              {visibleApplications.length}/{applications.length} 条
            </strong>
          </div>
          {visibleApplications.length ? (
            <div className="application-list">
              {visibleApplications.map((application) => {
                const linkedResume = resumeLookup.get(application.resumeId);
                const isStale =
                  linkedResume &&
                  new Date(linkedResume.updatedAt).getTime() > new Date(application.updatedAt).getTime();
                return (
                  <article className="application-row" key={application.id}>
                    <div className="application-main">
                      <strong>{application.job.company}</strong>
                      <span>{application.job.title}</span>
                      <small>
                        使用简历：{application.resumeTitle} · 渠道：{application.channel || "未记录"} · 投递：{application.appliedAt || "未记录"}
                      </small>
                      {isStale ? <small className="application-stale">此简历已修改，匹配分可能已过期，请重新计算。</small> : null}
                    </div>
                    <span className="score-pill">{application.report.score}</span>
                    <div className="application-actions">
                      <select
                        value={application.status}
                        onChange={(event) => {
                          const nextStatus = event.currentTarget.value;
                          if (isApplicationStatus(nextStatus)) {
                            onStatusChange(application.id, nextStatus);
                          }
                        }}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button className="secondary-button icon-button" type="button" onClick={() => onRecalculate(application.id)} title="重新计算匹配分">
                        <RefreshCcw size={17} />
                      </button>
                      <button className="destructive-button icon-button" type="button" onClick={() => onDelete(application.id)} title="删除投递记录">
                        <Trash2 size={17} />
                      </button>
                    </div>
                    <details className="application-details">
                      <summary>投递信息</summary>
                      <div className="application-detail-grid">
                        <label>
                          <span>投递日期</span>
                          <input
                            type="date"
                            value={application.appliedAt}
                            onChange={(event) => onDetailsChange(application.id, { appliedAt: event.target.value })}
                          />
                        </label>
                        <label>
                          <span>渠道</span>
                          <input
                            value={application.channel}
                            placeholder="官网 / Boss / 内推 / LinkedIn"
                            onChange={(event) => onDetailsChange(application.id, { channel: event.target.value })}
                          />
                        </label>
                        <label>
                          <span>HR 联系方式</span>
                          <input
                            value={application.hrContact}
                            placeholder="姓名、邮箱、微信或电话"
                            onChange={(event) => onDetailsChange(application.id, { hrContact: event.target.value })}
                          />
                        </label>
                        <label>
                          <span>下次跟进时间</span>
                          <input
                            type="datetime-local"
                            value={application.followUpAt}
                            onChange={(event) => onDetailsChange(application.id, { followUpAt: event.target.value })}
                          />
                        </label>
                        <label>
                          <span>面试时间</span>
                          <input
                            type="datetime-local"
                            value={application.interviewAt}
                            onChange={(event) => onDetailsChange(application.id, { interviewAt: event.target.value })}
                          />
                        </label>
                        <label className="application-detail-grid__wide">
                          <span>备注</span>
                          <textarea
                            value={application.notes}
                            placeholder="记录投递进展、面试反馈、待补充材料等"
                            onChange={(event) => onDetailsChange(application.id, { notes: event.target.value })}
                          />
                        </label>
                      </div>
                    </details>
                    <details className="question-details">
                      <summary>面试题</summary>
                      <QuestionBlock title="技术题" items={application.questions.technical} />
                      <QuestionBlock title="项目题" items={application.questions.project} />
                      <QuestionBlock title="HR 题" items={application.questions.behavioral} />
                    </details>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState title="没有匹配记录" text="换一个状态或搜索词试试。" />
          )}
        </>
      ) : (
        <EmptyState title="暂无投递记录" text="在 JD 匹配页保存一次分析后，这里会出现投递记录。" />
      )}
    </section>
  );
}

function QualityPanel({ report }: { report: ResumeQualityReport }) {
  return (
    <section className="quality-panel" aria-label="简历质量检查">
      <div className="quality-panel__summary">
        <div className="quality-score">{report.score}</div>
        <div>
          <strong>简历质量检查</strong>
          <p>
            估算 {report.estimatedPages} 页 · 内容量 {report.contentUnits} 单位。重点检查量化成果、项目结果、空泛表述和一页纸可读性。
          </p>
        </div>
      </div>
      <div className="quality-issue-list">
        {report.issues.map((issue) => (
          <article className={`quality-issue quality-issue--${issue.level}`} key={issue.id}>
            <strong>{issue.title}</strong>
            <span>{issue.detail}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function ResumeEditor({
  profile,
  resume,
  onUpdateResume,
}: {
  profile: CandidateProfile;
  resume: ResumeVersion;
  onUpdateResume: (id: string, patch: ResumeContentPatch) => void;
}) {
  const identity = getResumeIdentity(profile, resume);
  const updateIdentity = (patch: Partial<ResumeIdentity>) => {
    onUpdateResume(resume.id, { identity: { ...identity, ...patch } });
  };
  const updateSections = (patch: Partial<ResumeSections>) => {
    onUpdateResume(resume.id, { sections: { ...resume.sections, ...patch } });
  };

  return (
    <section className="resume-editor" aria-label="编辑简历内容">
      <div className="resume-editor__heading">
        <strong>编辑简历内容</strong>
        <span>基础信息、正文和导出内容会同步更新，修改后会自动标记为未核对。</span>
      </div>
      <div className="resume-editor__group">
        <strong>基础信息</strong>
        <div className="resume-editor__identity-grid">
          <label>
            <span>姓名</span>
            <input value={identity.name} onChange={(event) => updateIdentity({ name: event.target.value })} />
          </label>
          <label>
            <span>手机号</span>
            <input value={identity.phone} onChange={(event) => updateIdentity({ phone: event.target.value })} />
          </label>
          <label>
            <span>邮箱</span>
            <input value={identity.email} onChange={(event) => updateIdentity({ email: event.target.value })} />
          </label>
          <label>
            <span>城市</span>
            <input value={identity.location} onChange={(event) => updateIdentity({ location: event.target.value })} />
          </label>
          <label className="resume-editor__wide-field">
            <span>求职意向</span>
            <input value={resume.targetRole} onChange={(event) => onUpdateResume(resume.id, { targetRole: event.target.value })} />
          </label>
        </div>
      </div>
      <label>
        <span>个人总结</span>
        <textarea value={resume.sections.summary} onChange={(event) => updateSections({ summary: event.target.value })} />
      </label>
      <label>
        <span>技能（逗号或换行分隔）</span>
        <textarea value={resume.sections.skills.join(", ")} onChange={(event) => updateSections({ skills: splitSkills(event.target.value) })} />
      </label>
      <label>
        <span>教育经历（每行一条）</span>
        <textarea value={resume.sections.education.join("\n")} onChange={(event) => updateSections({ education: splitLines(event.target.value) })} />
      </label>
      <label>
        <span>项目经历（每行一条）</span>
        <textarea value={resume.sections.projects.join("\n")} onChange={(event) => updateSections({ projects: splitLines(event.target.value) })} />
      </label>
      <label>
        <span>实习/工作经历（每行一条）</span>
        <textarea value={resume.sections.experience.join("\n")} onChange={(event) => updateSections({ experience: splitLines(event.target.value) })} />
      </label>
      <label>
        <span>证书/奖项（每行一条）</span>
        <textarea value={resume.sections.awards.join("\n")} onChange={(event) => updateSections({ awards: splitLines(event.target.value) })} />
      </label>
    </section>
  );
}

function ReportView({
  job,
  report,
  resumeTitle,
  updatedAt,
}: {
  job: JobDraft;
  report: MatchReport;
  resumeTitle: string;
  updatedAt: string;
}) {
  return (
    <div className="report-stack">
      <div className="report-binding">
        <span>报告对象</span>
        <strong>
          {job.company} · {job.title}
        </strong>
        <small>
          使用简历：{resumeTitle} · 更新 {formatDate(updatedAt)}
        </small>
      </div>
      <div className="score-card">
        <div className="score-number">{report.score}</div>
        <div>
          <strong>匹配分</strong>
          <p>综合关键词权重、技能区覆盖和项目/经历证明度做本地估算。</p>
        </div>
      </div>
      <div className="score-explainer">
        <MetricCard icon={<Gauge size={18} />} label="关键词覆盖" value={`${report.weightedCoverage}%`} />
        <MetricCard icon={<FileText size={18} />} label="技能覆盖" value={`${report.skillCoverage}%`} />
        <MetricCard icon={<BriefcaseBusiness size={18} />} label="项目覆盖" value={`${report.projectCoverage}%`} />
      </div>
      <InsightList title="为什么是这个分数" items={report.scoreBreakdown} tone="blue" />
      <InsightList title="已覆盖关键词" items={report.matchedKeywords} tone="green" />
      <InsightList title="待补充关键词" items={report.missingKeywords} tone="amber" />
      <InsightList title="修改建议" items={report.suggestions} tone="blue" />
    </div>
  );
}

function ResumePaper({ profile, resume }: { profile: CandidateProfile; resume: ResumeVersion }) {
  const identity = getResumeIdentity(profile, resume);
  const contact = [identity.phone, identity.email, identity.location].filter(Boolean).join(" · ");
  return (
    <article className={`resume-paper resume-paper--${resume.template}`}>
      <header>
        <h2>{identity.name || "未命名候选人"}</h2>
        {contact ? <p>{contact}</p> : null}
      </header>
      {getOrderedResumeSections(resume).map((section) => (
        <ResumeSection items={section.items} key={section.title} title={section.title} />
      ))}
    </article>
  );
}

function ResumeSection({ title, items }: { title: string; items: string[] }) {
  const visibleItems = items.filter(Boolean);
  if (!visibleItems.length) {
    return null;
  }
  return (
    <section>
      <h3>{title}</h3>
      {visibleItems.length === 1 ? (
        <p>{visibleItems[0]}</p>
      ) : (
        <ul>
          {visibleItems.map((item, index) => (
            <li key={`${title}-${index}-${item.slice(0, 24)}`}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewNotice({
  resume,
  onMarkReviewed,
}: {
  resume: ResumeVersion;
  onMarkReviewed: (id: string, reviewed: boolean) => void;
}) {
  return (
    <div className={`review-box ${resume.reviewed ? "review-box--ok" : ""}`}>
      <div>
        <strong>{resume.reviewed ? "已确认内容真实" : "导出前需要人工核对"}</strong>
        <p>
          {resume.unsupportedClaims.length
            ? `发现可能需要核对的数字/年份：${resume.unsupportedClaims.join("、")}`
            : "当前内容来自经历库或粘贴文本，仍建议逐条核对时间、数字、公司名和技术栈。"}
        </p>
      </div>
      <label>
        <input
          checked={resume.reviewed}
          type="checkbox"
          onChange={(event) => onMarkReviewed(resume.id, event.target.checked)}
        />
        我已核对
      </label>
    </div>
  );
}

function InsightList({ items, title, tone }: { items: string[]; title: string; tone: "green" | "amber" | "blue" }) {
  return (
    <article className={`insight-list insight-list--${tone}`}>
      <h3>{title}</h3>
      {items.length ? (
        <ul>
          {items.map((item, index) => (
            <li key={`${title}-${index}-${item.slice(0, 24)}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>暂无明显内容。</p>
      )}
    </article>
  );
}

function QuestionBlock({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="question-block">
      <strong>{title}</strong>
      <ol>
        {items.map((item, index) => (
          <li key={`${title}-${index}-${item.slice(0, 24)}`}>{item}</li>
        ))}
      </ol>
    </div>
  );
}
