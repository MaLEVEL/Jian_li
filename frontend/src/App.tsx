import {
  ScanSearch,
  BriefcaseBusiness,
  Cable,
  LayoutDashboard,
  Library,
  Search,
  Settings,
  FileText,
  Shapes,
  Menu,
  X,
  CalendarDays,
  ChevronDown,
  ListTodo,
  MoreHorizontal,
  Target,
} from "lucide-react";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PROFILE, EMPTY_JOB, SAMPLE_FRONTEND_JOB } from "./constants";
import { getResumeTemplateDefinition } from "./templateCatalog";
import { NavButton, StatusMessage } from "./components";
import type { StatusMessageType } from "./components";
import {
  analyzeMatch,
  buildQuestions,
  buildResumeFromPastedText,
  buildResumeFromProfile,
  buildResumeRenderProfile,
  createId,
  downloadDocxFile,
  extractResumeIdentityFromText,
  extractResumeTargetRoleFromText,
  findUnsupportedClaims,
  inheritResumeAppearance,
  optimizeResume,
  printResumeAsPdf,
  renderResumeText,
} from "./resumeLogic";
import {
  createStoredPayload,
  loadStoredState,
  looksLikeStoredPayload,
  normalizeStoredState,
  STORAGE_KEY,
} from "./storage";
import type { BossJobRecord } from "./bossIntegration";
import {
  WorkspaceConflictError,
  createWorkspaceApi,
  loadWorkspaceSyncMeta,
  markWorkspaceClean,
  markWorkspaceDirty,
} from "./workspaceApi";
import type { WorkspaceEnvelope, WorkspaceStatePayload } from "./workspaceApi";
import type {
  ApplicationRecord,
  ApplicationStatus,
  CandidateProfile,
  JobDraft,
  MatchPreview,
  OpportunityRecord,
  OpportunityStage,
  ResumeContentPatch,
  ResumeImportDraft,
  ResumeTemplate,
  ResumeVersion,
  SavedJobView,
  TabId,
} from "./types";
import { AgentWorkspace } from "./components/AgentWorkspace";
import { IntegrationCenter } from "./components/IntegrationCenter";
import type { IntegrationSection } from "./components/IntegrationCenter";
import { InterviewPackage } from "./components/InterviewPackage";
import { TemplateLibrary } from "./components/TemplateLibrary";
import type { OpportunityHandlers, OpportunityCenterRecord } from "./components/OpportunityCenter";
import { ApplicationsView, BuilderView, OptimizerView, ProfileView, WorkspaceView } from "./views";
import {
  applyCompanyBlacklist,
  createDefaultNextAction,
  createManualOpportunity,
  createOpportunityCompanyKey,
  generateRuleBasedInterviewPackage,
  getCompanyBlacklistStates,
  groupApplicationTasks,
  OPPORTUNITY_STAGE_LABELS,
  parseOpportunityCsv,
  restoreCompanyBlacklist,
  upsertOpportunity,
} from "./opportunityPipeline";

function normalizeJobKey(job: JobDraft) {
  return [job.company, job.title].map((value) => value.trim().toLowerCase()).join("::");
}

function cleanJobDraft(job: JobDraft): JobDraft {
  return {
    company: job.company.trim(),
    title: job.title.trim(),
    description: job.description.trim(),
  };
}

function buildOptimizedResumeTitle(job: JobDraft) {
  return `${job.company}-${job.title}-定制版`;
}

function getBaseResumeId(resume?: ResumeVersion) {
  return resume?.parentResumeId ?? resume?.id ?? "";
}

const APPLICATION_STATUS_BY_OPPORTUNITY_STAGE: Partial<Record<OpportunityStage, ApplicationStatus>> = {
  new: "saved",
  saved: "saved",
  tailoring: "saved",
  applied: "applied",
  communicating: "screening",
  interviewing: "interviewing",
  offer: "offer",
  closed: "rejected",
};

interface AppMessage {
  id: number;
  text: string;
  type: StatusMessageType;
}

export default function App() {
  const storedState = useMemo(loadStoredState, []);
  const workspaceApi = useMemo(() => createWorkspaceApi(), []);
  const workspaceRevision = useRef<number | null>(null);
  const skipWorkspaceSave = useRef(true);
  const workspaceSyncBlocked = useRef(false);
  const workspaceSaveChain = useRef<Promise<boolean>>(Promise.resolve(false));
  const siteHeaderRef = useRef<HTMLElement | null>(null);
  const suppressNextWorkspaceSave = useRef(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceConflict, setWorkspaceConflict] = useState<WorkspaceEnvelope | undefined>();
  const [activeTab, setActiveTab] = useState<TabId>("workspace");
  const [navExpanded, setNavExpanded] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"materials" | "more" | null>(null);
  const [integrationSection, setIntegrationSection] = useState<IntegrationSection>("funnel");
  const [interviewOpportunityId, setInterviewOpportunityId] = useState("");
  const [profile, setProfile] = useState<CandidateProfile>(storedState.profile);
  const [resumes, setResumes] = useState<ResumeVersion[]>(storedState.resumes);
  const [applications, setApplications] = useState<ApplicationRecord[]>(storedState.applications);
  const [opportunities, setOpportunities] = useState<OpportunityRecord[]>(storedState.opportunities);
  const [jobPool, setJobPool] = useState(storedState.jobPool);
  const [selectedResumeId, setSelectedResumeId] = useState(storedState.resumes[0]?.id ?? "");
  const [jobDraft, setJobDraft] = useState<JobDraft>(EMPTY_JOB);
  const [matchPreview, setMatchPreview] = useState<MatchPreview | undefined>();
  const [importDraft, setImportDraft] = useState<ResumeImportDraft | undefined>();
  const [pasteTitle, setPasteTitle] = useState("我的已有简历");
  const [pasteText, setPasteText] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [message, setMessageState] = useState<AppMessage | undefined>({
    id: 0,
    text: "欢迎回到求职成长工作台，你的简历与投递会同步保存在本机服务器。",
    type: "success",
  });

  const selectedResume = useMemo(
    () => resumes.find((resume) => resume.id === selectedResumeId) ?? resumes[0],
    [resumes, selectedResumeId],
  );
  const latestApplication = applications[0];
  const workspacePayload = useMemo<WorkspaceStatePayload>(
    () => createStoredPayload(profile, resumes, applications, opportunities, jobPool),
    [applications, jobPool, opportunities, profile, resumes],
  );

  const opportunityCenterRecords = useMemo<OpportunityCenterRecord[]>(() => {
    const applicationsById = new Map(applications.map((application) => [application.id, application]));
    const resumesById = new Map(resumes.map((resume) => [resume.id, resume]));
    return opportunities.map((opportunity) => {
      const application = opportunity.applicationId ? applicationsById.get(opportunity.applicationId) : undefined;
      const resume = opportunity.resumeId ? resumesById.get(opportunity.resumeId) : undefined;
      return {
        ...opportunity,
        ...(application ? {
          application: {
            id: application.id,
            status: application.status,
            appliedAt: application.appliedAt,
            followUpAt: application.followUpAt,
            interviewAt: application.interviewAt,
            channel: application.channel,
            hrContact: application.hrContact,
            notes: application.notes,
            report: application.report,
          },
        } : {}),
        ...(resume ? { resume: { id: resume.id, title: resume.title, targetRole: resume.targetRole } } : {}),
      };
    });
  }, [applications, opportunities, resumes]);
  const visibleOpportunities = useMemo(() => {
    const blacklistedCompanies = getCompanyBlacklistStates(opportunities);
    return opportunities.filter((opportunity) =>
      !blacklistedCompanies.has(createOpportunityCompanyKey(opportunity.job.company)),
    );
  }, [opportunities]);
  const taskGroups = useMemo(
    () => groupApplicationTasks(visibleOpportunities, applications),
    [applications, visibleOpportunities],
  );
  const todayTasks = useMemo(
    () => [...taskGroups.overdue, ...taskGroups.today, ...taskGroups.next7Days].map((item) => ({
      id: `${item.opportunity.id}::${item.action.id}`,
      title: item.action.title,
      detail: `${item.opportunity.job.company} · ${item.opportunity.job.title}`,
      dueAt: item.dueAt,
      kind: item.action.kind === "tailor-resume"
        ? "resume" as const
        : item.action.kind === "prepare-interview"
          ? "interview" as const
          : item.action.kind === "follow-up"
            ? "follow-up" as const
            : "review" as const,
      priority: item.daysAhead < 0 ? "high" as const : "normal" as const,
      opportunityId: item.opportunity.id,
    })),
    [taskGroups],
  );
  const todayInterviews = useMemo(() => {
    const blacklistedCompanies = getCompanyBlacklistStates(opportunities);
    return applications
      .filter((application) =>
        application.interviewAt &&
        !blacklistedCompanies.has(createOpportunityCompanyKey(application.job.company)),
      )
      .map((application) => ({
        id: application.id,
        company: application.job.company,
        title: application.job.title,
        at: application.interviewAt,
        format: "video" as const,
        opportunityId: opportunities.find((opportunity) => opportunity.applicationId === application.id)?.id,
      }));
  }, [applications, opportunities]);
  const todayOpportunities = useMemo(
    () => visibleOpportunities
      .filter((opportunity) => opportunity.stage !== "unsuitable" && opportunity.stage !== "closed")
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((opportunity) => ({
        id: opportunity.id,
        company: opportunity.job.company,
        title: opportunity.job.title,
        stageLabel: OPPORTUNITY_STAGE_LABELS[opportunity.stage],
        nextStep: opportunity.nextAction?.completedAt ? "下一步已完成" : opportunity.nextAction?.title,
      })),
    [visibleOpportunities],
  );
  const currentInterviewOpportunity = useMemo(
    () => opportunities.find((opportunity) => opportunity.id === interviewOpportunityId),
    [interviewOpportunityId, opportunities],
  );
  const currentInterviewApplication = useMemo(
    () => currentInterviewOpportunity?.applicationId
      ? applications.find((application) => application.id === currentInterviewOpportunity.applicationId)
      : undefined,
    [applications, currentInterviewOpportunity],
  );
  const currentInterviewResume = useMemo(
    () => resumes.find((resume) => resume.id === (currentInterviewOpportunity?.resumeId || currentInterviewApplication?.resumeId)),
    [currentInterviewApplication?.resumeId, currentInterviewOpportunity?.resumeId, resumes],
  );
  const currentInterviewPackage = useMemo(
    () => currentInterviewOpportunity
      ? generateRuleBasedInterviewPackage(currentInterviewOpportunity, { application: currentInterviewApplication })
      : undefined,
    [currentInterviewApplication, currentInterviewOpportunity],
  );

  function setMessage(text: string, type: StatusMessageType = "success") {
    setMessageState({ id: Date.now(), text, type });
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(createStoredPayload(profile, resumes, applications, opportunities, jobPool)));
      if (workspaceReady && !skipWorkspaceSave.current && !suppressNextWorkspaceSave.current) {
        markWorkspaceDirty(workspaceRevision.current);
      }
    } catch (error) {
      console.error("Failed to save local 职启云帆 data", error);
      setMessage("本地保存失败：浏览器存储可能已满、被隐私模式限制，或简历文本过长。请先在对应页面导出当前数据，再清理浏览器存储。", "error");
    }
  }, [applications, jobPool, opportunities, profile, resumes]);
  useEffect(() => {
    let cancelled = false;
    async function hydrateFromWorkspace() {
      const localSync = loadWorkspaceSyncMeta();
      let suppressInitialAutosave = true;
      try {
        const remote = await workspaceApi.load();
        if (cancelled) return;
        if (remote) {
          workspaceRevision.current = remote.revision;
          if (localSync.dirty && localSync.revision !== remote.revision) {
            workspaceSyncBlocked.current = true;
            setWorkspaceConflict(remote);
            suppressNextWorkspaceSave.current = suppressInitialAutosave;
            setWorkspaceReady(true);
            return;
          }
          if (!localSync.dirty) {
            const restored = normalizeStoredState(remote.state);
            setProfile(restored.profile);
            setResumes(restored.resumes);
            setApplications(restored.applications);
            setOpportunities(restored.opportunities);
            setJobPool(restored.jobPool);
            setSelectedResumeId(restored.resumes[0]?.id ?? "");
            markWorkspaceClean(remote.revision);
          } else {
            markWorkspaceDirty(remote.revision);
            suppressInitialAutosave = false;
          }
        } else {
          const created = await workspaceApi.save(
            createStoredPayload(profile, resumes, applications, opportunities, jobPool),
            null,
          );
          if (cancelled) return;
          workspaceRevision.current = created.revision;
          markWorkspaceClean(created.revision);
        }
        window.setTimeout(() => {
          if (!cancelled) {
            suppressNextWorkspaceSave.current = suppressInitialAutosave;
            skipWorkspaceSave.current = false;
            setWorkspaceReady(true);
          }
        }, 0);
      } catch {
        if (cancelled) return;
        markWorkspaceDirty(localSync.revision ?? workspaceRevision.current);
        suppressNextWorkspaceSave.current = true;
        skipWorkspaceSave.current = false;
        setWorkspaceReady(true);
      }
    }
    void hydrateFromWorkspace();
    return () => { cancelled = true; };
  }, [workspaceApi]);

  const saveWorkspaceSnapshot = useCallback((revisionOverride?: number | null): Promise<boolean> => {
    const payload = workspacePayload;
    const task = workspaceSaveChain.current.then(async () => {
      if (!workspaceReady || skipWorkspaceSave.current) return false;
      const expectedRevision = revisionOverride === undefined ? workspaceRevision.current : revisionOverride;
      markWorkspaceDirty(expectedRevision);
      try {
        const saved = await workspaceApi.save(payload, expectedRevision);
        workspaceRevision.current = saved.revision;
        workspaceSyncBlocked.current = false;
        markWorkspaceClean(saved.revision);
        setWorkspaceConflict(undefined);
        return true;
      } catch (error) {
        if (error instanceof WorkspaceConflictError) {
          workspaceSyncBlocked.current = true;
          setWorkspaceConflict(error.current);
          setMessageState({
            id: Date.now(),
            text: "服务器工作区已在另一台设备更新。当前修改仍保留在本浏览器，请选择要保留的版本。",
            type: "warning",
          });
        }
        return false;
      }
    });
    workspaceSaveChain.current = task;
    return task;
  }, [workspaceApi, workspacePayload, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady || skipWorkspaceSave.current || workspaceSyncBlocked.current) return;
    if (suppressNextWorkspaceSave.current) {
      suppressNextWorkspaceSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void saveWorkspaceSnapshot();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [saveWorkspaceSnapshot, workspaceReady]);

  function keepLocalWorkspaceVersion() {
    if (!workspaceConflict) return;
    workspaceRevision.current = workspaceConflict.revision;
    workspaceSyncBlocked.current = false;
    setWorkspaceConflict(undefined);
    void saveWorkspaceSnapshot(workspaceConflict.revision);
  }

  function loadServerWorkspaceVersion() {
    if (!workspaceConflict) return;
    const restored = normalizeStoredState(workspaceConflict.state);
    suppressNextWorkspaceSave.current = true;
    setProfile(restored.profile);
    setResumes(restored.resumes);
    setApplications(restored.applications);
    setOpportunities(restored.opportunities);
    setJobPool(restored.jobPool);
    setSelectedResumeId(restored.resumes[0]?.id ?? "");
    workspaceRevision.current = workspaceConflict.revision;
    workspaceSyncBlocked.current = false;
    markWorkspaceClean(workspaceConflict.revision);
    setWorkspaceConflict(undefined);
    setMessage("已载入服务器上的最新版本，本地冲突副本不再覆盖服务器。", "warning");
  }

  useEffect(() => {
    if (!message?.text) {
      return;
    }
    const timer = window.setTimeout(() => {
      setMessageState((current) => (current?.id === message.id ? undefined : current));
    }, message.type === "error" ? 6000 : 4200);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!workspaceReady) return;
    const updateHeaderOffset = () => {
      const height = siteHeaderRef.current?.offsetHeight ?? 158;
      document.documentElement.style.setProperty('--site-header-offset', `${height}px`);
    };
    updateHeaderOffset();
    const observer = new ResizeObserver(updateHeaderOffset);
    if (siteHeaderRef.current) observer.observe(siteHeaderRef.current);
    window.addEventListener('resize', updateHeaderOffset);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeaderOffset);
    };
  }, [workspaceReady, navExpanded]);

  useEffect(() => {
    if (!resumes.length) {
      setSelectedResumeId("");
      return;
    }
    if (!resumes.some((resume) => resume.id === selectedResumeId)) {
      setSelectedResumeId(resumes[0].id);
    }
  }, [resumes, selectedResumeId]);

  useEffect(() => {
    if (matchPreview && !resumes.some((resume) => resume.id === matchPreview.resumeId)) {
      setMatchPreview(undefined);
    }
  }, [matchPreview, resumes]);

  useEffect(() => {
    setRenameDraft(selectedResume?.title ?? "");
  }, [selectedResume?.id, selectedResume?.title]);

  function updateProfile(field: keyof CandidateProfile) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setProfile((current) => ({ ...current, [field]: event.target.value }));
    };
  }

  function setProfileTemplate(patch: Partial<CandidateProfile>) {
    setProfile((current) => ({ ...current, ...patch }));
  }

  function updateJobDraft(draft: JobDraft) {
    setJobDraft(draft);
    setMatchPreview(undefined);
  }

  function selectResumeForMatching(id: string) {
    setSelectedResumeId(id);
    setMatchPreview(undefined);
  }

  function handleGenerateResume() {
    if (!profile.name.trim() || !profile.targetRole.trim()) {
      setMessage("请至少填写姓名和目标岗位，再生成简历。", "warning");
      navigateTo("profile");
      return;
    }

    const sections = buildResumeFromProfile(profile);
    const plainText = renderResumeText(profile, sections);
    const now = new Date().toISOString();
    const resume: ResumeVersion = {
      id: createId("resume"),
      title: `${profile.targetRole || "求职"}基础版简历`,
      source: "generated",
      template: "graduate",
      identity: {
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        location: profile.location,
      },
      targetRole: profile.targetRole,
      sections,
      plainText,
      unsupportedClaims: findUnsupportedClaims(profile, plainText),
      reviewed: false,
      createdAt: now,
      updatedAt: now,
    };

    setResumes((current) => [resume, ...current]);
    setSelectedResumeId(resume.id);
    navigateTo("builder");
    setMessage("已根据经历库生成一份基础简历。下一步可以去 JD 匹配，或在简历版本里继续编辑。");
    return resume;
  }

  function loadSampleUser() {
    setProfile(DEFAULT_PROFILE);
    navigateTo("profile");
    setMessage("已载入示例用户经历库，可直接生成简历或继续修改字段。");
  }

  function runDemoFlow() {
    const now = new Date();
    const nowIso = now.toISOString();
    const followUp = new Date(now);
    followUp.setDate(followUp.getDate() + 2);
    followUp.setHours(10, 0, 0, 0);
    const interview = new Date(now);
    interview.setDate(interview.getDate() + 5);
    interview.setHours(14, 30, 0, 0);

    const baseSections = buildResumeFromProfile(DEFAULT_PROFILE);
    const basePlainText = renderResumeText(DEFAULT_PROFILE, baseSections);
    const baseResume: ResumeVersion = {
      id: createId("resume"),
      title: `${DEFAULT_PROFILE.targetRole}基础版简历`,
      source: "generated",
      template: "internship",
      identity: {
        name: DEFAULT_PROFILE.name,
        email: DEFAULT_PROFILE.email,
        phone: DEFAULT_PROFILE.phone,
        location: DEFAULT_PROFILE.location,
      },
      targetRole: DEFAULT_PROFILE.targetRole,
      sections: baseSections,
      plainText: basePlainText,
      unsupportedClaims: findUnsupportedClaims(DEFAULT_PROFILE, basePlainText),
      reviewed: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const report = analyzeMatch(basePlainText, SAMPLE_FRONTEND_JOB.description, baseSections);
    const optimizedSections = optimizeResume(DEFAULT_PROFILE, baseResume, SAMPLE_FRONTEND_JOB, report);
    const optimizedPlainText = renderResumeText(
      { ...DEFAULT_PROFILE, targetRole: SAMPLE_FRONTEND_JOB.title },
      optimizedSections,
    );
    const optimizedResume: ResumeVersion = {
      id: createId("resume"),
      title: buildOptimizedResumeTitle(SAMPLE_FRONTEND_JOB),
      source: "optimized",
      template: "internship",
      identity: baseResume.identity,
      targetRole: SAMPLE_FRONTEND_JOB.title,
      company: SAMPLE_FRONTEND_JOB.company,
      jobTitle: SAMPLE_FRONTEND_JOB.title,
      parentResumeId: baseResume.id,
      appearance: inheritResumeAppearance(baseResume),
      sections: optimizedSections,
      plainText: optimizedPlainText,
      unsupportedClaims: findUnsupportedClaims(DEFAULT_PROFILE, optimizedPlainText),
      reviewed: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const demoApplication: ApplicationRecord = {
      id: createId("app"),
      job: { ...SAMPLE_FRONTEND_JOB },
      status: "screening",
      appliedAt: nowIso.slice(0, 10),
      channel: "内推",
      hrContact: "demo-hr@example.com",
      followUpAt: followUp.toISOString().slice(0, 16),
      interviewAt: interview.toISOString().slice(0, 16),
      notes: "演示数据：已完成 JD 匹配、定制简历、跟进提醒和面试日程。",
      resumeId: optimizedResume.id,
      resumeTitle: optimizedResume.title,
      report,
      questions: buildQuestions(report, SAMPLE_FRONTEND_JOB),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setProfile(DEFAULT_PROFILE);
    setJobDraft(SAMPLE_FRONTEND_JOB);
    setResumes((current) => [optimizedResume, baseResume, ...current]);
    setApplications((current) => [demoApplication, ...current]);
    setSelectedResumeId(optimizedResume.id);
    navigateTo("applications");
    setMessage("已载入完整演示流程：示例用户、基础简历、岗位定制版和一条投递记录。");
  }

  function updatePasteTitle(value: string) {
    setPasteTitle(value);
    setImportDraft((current) => (current ? { ...current, title: value } : current));
  }

  function updatePasteText(value: string) {
    setPasteText(value);
    setImportDraft(undefined);
  }

  function previewPastedResumeImport() {
    const text = pasteText.trim();
    if (!text) {
      setMessage("请先粘贴已有简历文本。", "warning");
      return;
    }

    const sections = buildResumeFromPastedText(text);
    const identity = extractResumeIdentityFromText(text);
    const targetRole = extractResumeTargetRoleFromText(text);
    setImportDraft({
      title: pasteTitle.trim() || `${identity.name || "我的"}已有简历`,
      identity,
      targetRole,
      sections,
    });
    setMessage("已识别简历结构，请核对姓名、联系方式和各段经历后再保存。");
  }

  function confirmPastedResumeImport() {
    if (!importDraft) {
      setMessage("请先粘贴简历并识别结构。", "warning");
      return;
    }

    const now = new Date().toISOString();
    const plainText = renderResumeText(
      { ...profile, ...importDraft.identity, targetRole: importDraft.targetRole || "目标岗位" },
      importDraft.sections,
    );
    const resume: ResumeVersion = {
      id: createId("resume"),
      title: importDraft.title.trim() || `${importDraft.identity.name || "我的"}已有简历`,
      source: "uploaded",
      template: "graduate",
      identity: importDraft.identity,
      targetRole: importDraft.targetRole || "目标岗位",
      sections: importDraft.sections,
      plainText,
      unsupportedClaims: [],
      reviewed: false,
      createdAt: now,
      updatedAt: now,
    };

    setResumes((current) => [resume, ...current]);
    setSelectedResumeId(resume.id);
    setPasteText("");
    setPasteTitle("我的已有简历");
    setImportDraft(undefined);
    setMessage("已把确认后的简历结构保存为一个版本。");
  }

  function cancelPastedResumeImport() {
    setImportDraft(undefined);
    setMessage("已取消本次导入确认，原始粘贴文本仍保留。", "warning");
  }

  function getMatchInput() {
    if (!selectedResume) {
      setMessage("请先生成或粘贴一份简历，再做 JD 匹配。", "warning");
      navigateTo("builder");
      return undefined;
    }
    const cleanedJob = cleanJobDraft(jobDraft);
    if (!cleanedJob.company || !cleanedJob.title || !cleanedJob.description) {
      setMessage("请填写公司、岗位和 JD 描述。", "warning");
      return undefined;
    }

    setJobDraft(cleanedJob);
    return { job: cleanedJob, resume: selectedResume };
  }

  function handleAnalyzePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = getMatchInput();
    if (!input) {
      return;
    }

    const report = analyzeMatch(input.resume.plainText, input.job.description, input.resume.sections);
    setMatchPreview({
      job: { ...input.job },
      resumeId: input.resume.id,
      resumeTitle: input.resume.title,
      report,
      updatedAt: new Date().toISOString(),
    });
    setMessage("已生成匹配报告。你可以先查看分数解释、缺口和建议，再保存为投递记录。");
  }

  function saveMatchAsApplication() {
    if (!matchPreview) {
      setMessage("请先生成匹配报告，再保存投递记录。", "warning");
      return;
    }

    const previewResume = resumes.find((resume) => resume.id === matchPreview.resumeId);
    if (!previewResume) {
      setMessage("无法保存：这份匹配报告关联的简历版本已不存在。", "error");
      return;
    }

    const now = new Date().toISOString();
    const baseResumeId = getBaseResumeId(previewResume);
    const jobKey = normalizeJobKey(matchPreview.job);
    const existingApplication = applications.find((application) => {
      const applicationResume = resumes.find((resume) => resume.id === application.resumeId);
      return normalizeJobKey(application.job) === jobKey && getBaseResumeId(applicationResume) === baseResumeId;
    });

    if (existingApplication) {
      setApplications((current) =>
        current.map((application) =>
          application.id === existingApplication.id
            ? {
                ...application,
                job: { ...matchPreview.job },
                resumeId: previewResume.id,
                resumeTitle: previewResume.title,
                report: matchPreview.report,
                questions: buildQuestions(matchPreview.report, matchPreview.job),
                updatedAt: now,
              }
            : application,
        ),
      );
      setOpportunities((current) => current.map((opportunity) =>
        opportunity.applicationId === existingApplication.id
          ? {
              ...opportunity,
              job: { ...matchPreview.job },
              resumeId: previewResume.id,
              applicationId: existingApplication.id,
              updatedAt: now,
            }
          : opportunity,
      ));
      setMessage("已更新同公司同岗位的投递记录，机会漏斗保持原状态。");
      return;
    }

    const application: ApplicationRecord = {
      id: createId("app"),
      job: { ...matchPreview.job },
      status: "saved",
      appliedAt: now.slice(0, 10),
      channel: "未记录",
      hrContact: "",
      followUpAt: "",
      interviewAt: "",
      notes: "",
      resumeId: previewResume.id,
      resumeTitle: previewResume.title,
      report: matchPreview.report,
      questions: buildQuestions(matchPreview.report, matchPreview.job),
      createdAt: now,
      updatedAt: now,
    };

    setApplications((current) => [application, ...current]);
    const linkedOpportunity = opportunities.find((opportunity) =>
      normalizeJobKey(opportunity.job) === jobKey,
    );
    if (linkedOpportunity) {
      updateOpportunity(linkedOpportunity.id, (opportunity) => ({
        ...opportunity,
        applicationId: application.id,
        resumeId: previewResume.id,
        updatedAt: now,
      }));
    } else {
      const created = createManualOpportunity({
        company: application.job.company,
        title: application.job.title,
        description: application.job.description,
        stage: "saved",
        applicationId: application.id,
        resumeId: previewResume.id,
        channel: application.channel,
      }, { now });
      setOpportunities((current) => [{ ...created, source: "workspace" }, ...current]);
    }
    setMessage("已保存为投递记录并同步到机会漏斗，后续可在跟进页补充渠道和下一步。");
  }

  function generateCustomizedResumeFromPreview() {
    if (!matchPreview) {
      setMessage("请先生成匹配报告，再生成岗位定制版简历。", "warning");
      return;
    }

    const sourceResume = resumes.find((resume) => resume.id === matchPreview.resumeId);
    if (!sourceResume) {
      setMessage("无法生成：这份匹配报告关联的简历版本已不存在。", "error");
      return;
    }

    const sections = optimizeResume(profile, sourceResume, matchPreview.job, matchPreview.report);
    const optimizedIdentity = sourceResume.identity ?? {
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
    };
    const plainText = renderResumeText({ ...profile, ...optimizedIdentity, targetRole: matchPreview.job.title }, sections);
    const report = analyzeMatch(plainText, matchPreview.job.description, sections);
    const now = new Date().toISOString();
    const baseResumeId = getBaseResumeId(sourceResume);
    const jobKey = normalizeJobKey(matchPreview.job);
    const optimizedTitle = buildOptimizedResumeTitle(matchPreview.job);
    const existingOptimizedResume = resumes.find((resume) => {
      if (resume.source !== "optimized" || getBaseResumeId(resume) !== baseResumeId) {
        return false;
      }
      return normalizeJobKey({
        company: resume.company ?? "",
        title: resume.jobTitle ?? "",
        description: "",
      }) === jobKey;
    });

    if (existingOptimizedResume) {
      setResumes((current) =>
        current.map((resume) =>
          resume.id === existingOptimizedResume.id
            ? {
                ...resume,
                title: optimizedTitle,
                targetRole: matchPreview.job.title,
                company: matchPreview.job.company,
                jobTitle: matchPreview.job.title,
                identity: optimizedIdentity,
                appearance: inheritResumeAppearance(sourceResume),
                sections,
                plainText,
                unsupportedClaims: findUnsupportedClaims(profile, plainText),
                reviewed: false,
                updatedAt: now,
              }
            : resume,
        ),
      );
      setSelectedResumeId(existingOptimizedResume.id);
      setMatchPreview({
        job: { ...matchPreview.job },
        resumeId: existingOptimizedResume.id,
        resumeTitle: optimizedTitle,
        report,
        updatedAt: now,
      });
      setMessage("已更新已有的岗位定制版简历。确认内容后，可再保存为投递记录或导出。");
      return;
    }

    const optimizedResume: ResumeVersion = {
      id: createId("resume"),
      title: optimizedTitle,
      source: "optimized",
      template: sourceResume.template,
      identity: optimizedIdentity,
      targetRole: matchPreview.job.title,
      company: matchPreview.job.company,
      jobTitle: matchPreview.job.title,
      parentResumeId: baseResumeId,
      appearance: inheritResumeAppearance(sourceResume),
      sections,
      plainText,
      unsupportedClaims: findUnsupportedClaims(profile, plainText),
      reviewed: false,
      createdAt: now,
      updatedAt: now,
    };

    setResumes((current) => [optimizedResume, ...current]);
    setSelectedResumeId(optimizedResume.id);
    setMatchPreview({
      job: { ...matchPreview.job },
      resumeId: optimizedResume.id,
      resumeTitle: optimizedResume.title,
      report,
      updatedAt: now,
    });
    setMessage("已生成岗位定制版简历。它还没有自动保存为投递记录，请核对后按需保存。");
  }

  function useSampleJob() {
    setJobDraft(SAMPLE_FRONTEND_JOB);
    setMatchPreview(undefined);
    navigateTo("optimizer");
    setMessage("已填入前端实习示例 JD，可直接生成匹配报告体验完整流程。");
  }

  function clearJobDraft() {
    setJobDraft(EMPTY_JOB);
    setMatchPreview(undefined);
    setMessage("已清空 JD 表单。");
  }

  async function pasteJobDescriptionFromClipboard() {
    if (!navigator.clipboard?.readText) {
      setMessage("当前浏览器不支持读取剪贴板，请手动粘贴 JD 描述。", "warning");
      return;
    }

    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setMessage("剪贴板里没有可粘贴的 JD 文本。", "warning");
        return;
      }
      setJobDraft((current) => ({ ...current, description: text }));
      setMatchPreview(undefined);
      setMessage("已把剪贴板内容填入 JD 描述。公司名和岗位名仍可手动调整。");
    } catch {
      setMessage("浏览器暂时不允许读取剪贴板，请手动粘贴 JD 描述。", "warning");
    }
  }

  function updateResumeContent(id: string, patch: ResumeContentPatch) {
    const target = resumes.find((resume) => resume.id === id);
    if (!target) {
      return;
    }
    const now = new Date().toISOString();
    const nextResume: ResumeVersion = {
      ...target,
      ...patch,
      sections: patch.sections ?? target.sections,
    };
    const sections = nextResume.sections;
    const plainText = renderResumeText(buildResumeRenderProfile(profile, nextResume), sections);
    const unsupportedClaims = findUnsupportedClaims(profile, plainText);
    const hasLinkedApplications = applications.some((application) => application.resumeId === id);
    const contentChanged = Boolean(patch.identity || patch.targetRole !== undefined || patch.sections);

    setResumes((current) =>
      current.map((resume) =>
        resume.id === id
          ? {
              ...resume,
              ...patch,
              sections,
              plainText,
              unsupportedClaims,
              reviewed: contentChanged ? false : resume.reviewed,
              updatedAt: now,
            }
          : resume,
      ),
    );
    if (hasLinkedApplications) {
      setApplications((current) =>
        current.map((application) => {
          if (application.resumeId !== id) {
            return application;
          }
          const report = analyzeMatch(plainText, application.job.description, sections);
          return {
            ...application,
            report,
            questions: buildQuestions(report, application.job),
            updatedAt: now,
          };
        }),
      );
    }
    setMessage(
      hasLinkedApplications
        ? "简历内容已更新，关联投递记录的匹配报告也已重新计算。导出前请重新核对内容。"
        : "简历内容已更新，导出前请重新核对内容。",
    );
  }

  function recalculateApplication(id: string) {
    const targetApplication = applications.find((application) => application.id === id);
    if (!targetApplication) {
      return;
    }
    const targetResume = resumes.find((resume) => resume.id === targetApplication.resumeId);
    if (!targetResume) {
      setMessage("无法重新计算：这条投递记录关联的简历版本不存在。", "error");
      return;
    }

    const report = analyzeMatch(targetResume.plainText, targetApplication.job.description, targetResume.sections);
    const now = new Date().toISOString();
    setApplications((current) =>
      current.map((application) =>
        application.id === id
          ? {
              ...application,
              resumeTitle: targetResume.title,
              report,
              questions: buildQuestions(report, application.job),
              updatedAt: now,
            }
          : application,
      ),
    );
    setMessage("已按当前简历内容重新计算匹配分和面试题。");
  }

  function renameResume(id: string) {
    const title = renameDraft.trim();
    if (!title) {
      setMessage("简历标题不能为空。", "warning");
      return;
    }

    setResumes((current) =>
      current.map((resume) =>
        resume.id === id ? { ...resume, title, updatedAt: new Date().toISOString() } : resume,
      ),
    );
    setApplications((current) =>
      current.map((application) =>
        application.resumeId === id ? { ...application, resumeTitle: title, updatedAt: new Date().toISOString() } : application,
      ),
    );
    setMessage("简历版本名称已更新。");
  }

  function updateResumeTemplate(id: string, template: ResumeTemplate) {
    setResumes((current) =>
      current.map((resume) => {
        if (resume.id !== id) return resume;
        const currentAccent = getResumeTemplateDefinition(resume.template).accent;
        const nextAccent = getResumeTemplateDefinition(template).accent;
        return {
          ...resume,
          template,
          appearance: resume.appearance
            ? { ...resume.appearance, accent: resume.appearance.accent === currentAccent ? nextAccent : resume.appearance.accent }
            : undefined,
          updatedAt: new Date().toISOString(),
        };
      }),
    );
    setMessage("简历模板已切换，正文与个人信息保持不变；导出前请检查排版。");
  }

  function deleteResume(id: string) {
    const target = resumes.find((resume) => resume.id === id);
    if (!target) {
      return;
    }
    const linkedApplicationCount = applications.filter((application) => application.resumeId === id).length;
    const childResumeCount = resumes.filter((resume) => resume.parentResumeId === id).length;
    const childNotice = childResumeCount
      ? `基于它生成的 ${childResumeCount} 份定制版简历会保留，并转为独立版本。`
      : "没有子版本需要处理。";
    const ok = window.confirm(
      `确定删除“${target.title}”吗？直接关联的 ${linkedApplicationCount} 条投递记录会一起移除。${childNotice}`,
    );
    if (!ok) {
      return;
    }

    const now = new Date().toISOString();
    const removedApplicationIds = new Set(applications.filter((application) => application.resumeId === id).map((application) => application.id));
    setResumes((current) =>
      current
        .filter((resume) => resume.id !== id)
        .map((resume) =>
          resume.parentResumeId === id ? { ...resume, parentResumeId: undefined, updatedAt: now } : resume,
        ),
    );
    setApplications((current) => current.filter((application) => application.resumeId !== id));
    setOpportunities((current) => current.map((opportunity) => ({
      ...opportunity,
      applicationId: opportunity.applicationId && removedApplicationIds.has(opportunity.applicationId) ? undefined : opportunity.applicationId,
      resumeId: opportunity.resumeId === id ? undefined : opportunity.resumeId,
      updatedAt: now,
    })));
    setMessage(childResumeCount ? "简历版本已删除，基于它生成的定制版简历已保留为独立版本。" : "简历版本已删除。");
  }

  function deleteApplication(id: string) {
    const target = applications.find((application) => application.id === id);
    if (!target) {
      return;
    }
    const ok = window.confirm(`确定删除“${target.job.company} · ${target.job.title}”这条投递记录吗？简历版本会保留。`);
    if (!ok) {
      return;
    }
    const now = new Date().toISOString();
    setApplications((current) => current.filter((application) => application.id !== id));
    setOpportunities((current) => current.map((opportunity) =>
      opportunity.applicationId === id ? { ...opportunity, applicationId: undefined, updatedAt: now } : opportunity,
    ));
    setMessage("投递记录已删除。");
  }

  function markReviewed(id: string, reviewed: boolean) {
    setResumes((current) =>
      current.map((resume) =>
        resume.id === id ? { ...resume, reviewed, updatedAt: new Date().toISOString() } : resume,
      ),
    );
  }

  function updateApplicationStatus(id: string, status: ApplicationStatus) {
    const now = new Date().toISOString();
    setApplications((current) =>
      current.map((application) =>
        application.id === id ? { ...application, status, updatedAt: now } : application,
      ),
    );
    const stageByStatus: Record<ApplicationStatus, OpportunityStage> = {
      saved: "saved",
      applied: "applied",
      screening: "communicating",
      interviewing: "interviewing",
      offer: "offer",
      rejected: "closed",
    };
    setOpportunities((current) => current.map((opportunity) =>
      opportunity.applicationId === id
        ? {
            ...opportunity,
            stage: stageByStatus[status],
            stageChangedAt: now,
            updatedAt: now,
            nextAction: createDefaultNextAction(stageByStatus[status], opportunity.nextAction?.dueAt ?? "", now),
          }
        : opportunity,
    ));
  }

  function updateApplicationDetails(
    id: string,
    patch: Partial<Pick<ApplicationRecord, "appliedAt" | "channel" | "hrContact" | "followUpAt" | "interviewAt" | "notes">>,
  ) {
    const now = new Date().toISOString();
    const currentApplication = applications.find((application) => application.id === id);
    setApplications((current) =>
      current.map((application) =>
        application.id === id
          ? { ...application, ...patch, status: patch.interviewAt ? "interviewing" : application.status, updatedAt: now }
          : application,
      ),
    );
    if (!currentApplication) return;
    setOpportunities((current) => current.map((opportunity) =>
      opportunity.applicationId === id
        ? {
            ...opportunity,
            channel: patch.channel ?? opportunity.channel,
            contact: patch.hrContact ?? opportunity.contact,
            notes: patch.notes ?? opportunity.notes,
            updatedAt: now,
            ...(patch.interviewAt ? {
              stage: opportunity.stage === "offer" ? opportunity.stage : "interviewing" as const,
              nextAction: createDefaultNextAction("interviewing", opportunity.nextAction?.dueAt ?? "", now),
            } : {}),
          }
        : opportunity,
    ));
  }

  async function copyResume(resume: ResumeVersion) {
    try {
      await navigator.clipboard.writeText(resume.plainText);
      setMessage("简历文本已复制到剪贴板。");
    } catch {
      setMessage("浏览器暂时不允许写入剪贴板，可以手动选中文本复制。", "warning");
    }
  }

  async function exportResume(resume: ResumeVersion) {
    if (!resume.reviewed) {
      setMessage("请先勾选“我已核对”，再下载 Word (.docx) 文件。", "warning");
      return;
    }
    try {
      await downloadDocxFile(profile, resume);
      setMessage("已下载 Word (.docx) 文件，可用 Word/WPS 打开编辑；如需 PDF，可在 Word/WPS 中另存为 PDF。");
    } catch (error) {
      console.error("Failed to export DOCX", error);
      setMessage("下载 Word (.docx) 失败，请稍后重试；简历内容仍保存在当前浏览器。", "error");
    }
  }

  async function exportResumePdf(resume: ResumeVersion) {
    if (!resume.reviewed) {
      setMessage("请先勾选“我已核对”，再打开打印/保存 PDF。", "warning");
      return;
    }
    try {
      await printResumeAsPdf(profile, resume);
      setMessage("已打开浏览器打印窗口，请在打印目标里选择“另存为 PDF”或“保存为 PDF”。");
    } catch (error) {
      setMessage(
        error instanceof Error && /image load failed/i.test(error.message)
          ? "简历照片加载失败，已阻止打印。请更换照片后重试。"
          : "浏览器拦截了打印窗口，请允许弹窗后再试。",
        "warning",
      );
    }
  }

  const pageCopy: Record<TabId, { title: string; description: string }> = {
    workspace: { title: "今日驾驶舱", description: "先处理时间敏感的动作，再让机会、材料和面试准备稳步推进。" },
    integration: { title: "机会中心", description: "把发现、判断、材料、跟进和面试放在同一条清晰路径里。" },
    agent: { title: "把目标岗位，看得更清楚。", description: "从岗位要求到真实经历，找到值得表达的优势和下一步准备方向。" },
    profile: { title: "先把做过的事，写下来。", description: "课程项目、实习和个人作品，都是你自己的素材。" },
    builder: { title: "一份简历，一个合适的版本。", description: "专心编辑，随时预览。把最能说明你的经历放在前面。" },
    optimizer: { title: "给这次投递，多一点针对性。", description: "用本地规则核对关键词，再用自己的事实判断取舍。" },
    applications: { title: "跟进", description: "记录下一步、完成或改期跟进，再从面试任务打开准备包。" },
    templates: { title: "选个版式，找到表达的起点。", description: "简历版式与岗位内容框架可以分别选择，真实经历始终由你填写。" },
  };

  function chooseLibraryTemplate(template: ResumeTemplate) {
    if (selectedResume) {
      updateResumeTemplate(selectedResume.id, template);
    } else {
      const created = handleGenerateResume();
      if (!created) return;
      setResumes((current) => current.map((resume) => resume.id === created.id ? { ...resume, template } : resume));
    }
    navigateTo("builder");
    setMessage("已应用简历版式，经历内容保持原样。");
  }

  function updateOpportunity(
    opportunityId: string,
    updater: (opportunity: OpportunityRecord) => OpportunityRecord,
  ) {
    const now = new Date().toISOString();
    setOpportunities((current) => current.map((opportunity) =>
      opportunity.id === opportunityId ? updater({ ...opportunity, updatedAt: now }) : opportunity,
    ));
  }

  function advanceOpportunity(opportunityId: string, nextStage: OpportunityStage) {
    const now = new Date().toISOString();
    updateOpportunity(opportunityId, (opportunity) => ({
      ...opportunity,
      stage: nextStage,
      stageChangedAt: now,
      nextAction: createDefaultNextAction(nextStage, opportunity.nextAction?.dueAt ?? "", now),
      updatedAt: now,
    }));
    const nextStatus = APPLICATION_STATUS_BY_OPPORTUNITY_STAGE[nextStage];
    if (nextStatus) {
      setApplications((current) => current.map((application) =>
        application.id === opportunities.find((opportunity) => opportunity.id === opportunityId)?.applicationId
          ? { ...application, status: nextStatus, updatedAt: now }
          : application,
      ));
    }
    setMessage(`机会已推进至“${OPPORTUNITY_STAGE_LABELS[nextStage]}”。`);
  }

  function markOpportunityUnsuitable(opportunityId: string) {
    const now = new Date().toISOString();
    updateOpportunity(opportunityId, (opportunity) => ({
      ...opportunity,
      stage: "unsuitable",
      stageChangedAt: now,
      nextAction: undefined,
    }));
    const linkedApplicationId = opportunities.find((opportunity) => opportunity.id === opportunityId)?.applicationId;
    if (linkedApplicationId) {
      setApplications((current) => current.map((application) =>
        application.id === linkedApplicationId ? { ...application, status: "rejected", updatedAt: now } : application,
      ));
    }
    setMessage("机会已标记为不适合，BOSS 原始职位不会被修改。", "warning");
  }

  function undoOpportunityExit(opportunityId: string) {
    const now = new Date().toISOString();
    updateOpportunity(opportunityId, (opportunity) => ({
      ...opportunity,
      stage: "new",
      stageChangedAt: now,
      nextAction: createDefaultNextAction("new", "", now),
    }));
    const linkedApplicationId = opportunities.find((opportunity) => opportunity.id === opportunityId)?.applicationId;
    if (linkedApplicationId) {
      setApplications((current) => current.map((application) =>
        application.id === linkedApplicationId ? { ...application, status: "saved", updatedAt: now } : application,
      ));
    }
    setMessage("已将机会恢复到待筛选。");
  }

  function completeOpportunityAction(opportunityId: string, actionId: string) {
    const completedAt = new Date().toISOString();
    updateOpportunity(opportunityId, (opportunity) => ({
      ...opportunity,
      nextAction: opportunity.nextAction?.id === actionId
        ? { ...opportunity.nextAction, completedAt }
        : opportunity.nextAction,
    }));
    setMessage("下一步已完成，今日驾驶舱已同步更新。");
  }

  function rescheduleOpportunityAction(opportunityId: string, dueAt: string) {
    const parsed = new Date(dueAt);
    const normalizedDueAt = Number.isNaN(parsed.getTime()) ? dueAt : parsed.toISOString();
    updateOpportunity(opportunityId, (opportunity) => ({
      ...opportunity,
      nextAction: opportunity.nextAction
        ? { ...opportunity.nextAction, dueAt: normalizedDueAt, completedAt: undefined }
        : createDefaultNextAction(opportunity.stage, normalizedDueAt),
    }));
    setMessage("下一步已改期。");
  }

  function saveOpportunityView(view: Omit<SavedJobView, "id">) {
    if (jobPool.savedViews.length >= 5) {
      setMessage("筛选视图最多保存 5 个，请先删除一个旧视图。", "warning");
      return;
    }
    const id = createId("view");
    setJobPool((current) => ({ savedViews: [...current.savedViews, { ...view, id }].slice(0, 5) }));
    setMessage(`已保存筛选视图“${view.name}”。`);
  }

  function deleteOpportunityView(viewId: string) {
    setJobPool((current) => ({ savedViews: current.savedViews.filter((view) => view.id !== viewId) }));
    setMessage("筛选视图已删除。");
  }

  function confirmOpportunityImport(kind: "paste" | "csv", rawText: string) {
    let imported: OpportunityRecord[] = [];
    if (kind === "csv") {
      const preview = parseOpportunityCsv(rawText, { existingOpportunities: opportunities });
      if (!preview.canImport) {
        setMessage(preview.globalErrors[0]?.message || "CSV 仍有无效应行，请修正后再导入。", "warning");
        return;
      }
      imported = preview.records;
    } else {
      imported = rawText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
          const [company = "", title = "", location = "", description = ""] = line.split(/\t|,|;|\||｜/).map((cell) => cell.trim());
          if (!company || !title) return [];
          return [createManualOpportunity({ company, title, description, location, stage: "new" })];
        });
    }
    if (!imported.length) {
      setMessage("没有可导入的有效机会。", "warning");
      return;
    }
    const next = imported.reduce(
      (current, opportunity) => upsertOpportunity(current, opportunity),
      opportunities,
    );
    const additions = Math.max(0, next.length - opportunities.length);
    setOpportunities(next);
    setMessage(`已导入 ${additions} 条新机会；${imported.length - additions} 条重复记录已按来源合并，已有阶段与下一步保持不变。`);
  }

  function addBossJobToFunnel(job: BossJobRecord) {
    const created = createManualOpportunity({
      company: job.company,
      title: job.title,
      description: job.description || `${job.company} ${job.title}`,
      location: job.location,
      salary: job.salary,
      url: job.source_url,
      stage: "new",
      channel: "BOSS",
      notes: [job.experience, job.education, ...job.tags].filter(Boolean).join(" · "),
    });
    const opportunity: OpportunityRecord = {
      ...created,
      id: `opp-boss-${job.id}`,
      source: "boss",
      sourceJobId: job.source_job_id,
      sourceUrl: job.source_url,
    };
    const next = upsertOpportunity(opportunities, opportunity);
    const duplicate = next.length === opportunities.length;
    setOpportunities(next);
    setIntegrationSection("funnel");
    navigateTo("integration");
    setMessage(
      duplicate
        ? "该 BOSS 职位已在机会漏斗中，已更新岗位快照并保留现有阶段。"
        : `已将“${job.company} · ${job.title}”加入机会漏斗；没有触发投递或沟通。`,
      duplicate ? "warning" : "success",
    );
  }

  function attachSelectedResumeToOpportunity(opportunityId: string) {
    const resume = selectedResume ?? resumes[0];
    if (!resume) {
      setMessage("当前还没有简历版本，先生成或导入一份简历。", "warning");
      navigateTo("builder");
      return;
    }
    const opportunity = opportunities.find((item) => item.id === opportunityId);
    updateOpportunity(opportunityId, (current) => ({
      ...current,
      resumeId: resume.id,
      updatedAt: new Date().toISOString(),
    }));
    setSelectedResumeId(resume.id);
    navigateTo("builder");
    setMessage(`已将“${resume.title}”关联到${opportunity ? `“${opportunity.job.company} · ${opportunity.job.title}”` : "当前机会"}。`);
  }

  function prepareOpportunityResume(opportunityId: string) {
    const opportunity = opportunities.find((item) => item.id === opportunityId);
    const sourceResume = resumes.find((resume) => resume.id === opportunity?.resumeId) ?? selectedResume ?? resumes[0];
    if (!opportunity) {
      setMessage("无法准备简历：机会不存在。", "error");
      return;
    }
    if (!sourceResume) {
      setMessage("请先生成或导入一份基础简历，再按岗位准备定制版。", "warning");
      navigateTo("builder");
      return;
    }
    const job = {
      company: opportunity.job.company,
      title: opportunity.job.title,
      description: opportunity.job.description,
    };
    const report = analyzeMatch(sourceResume.plainText, job.description, sourceResume.sections);
    setSelectedResumeId(sourceResume.id);
    setJobDraft(job);
    setMatchPreview({
      job,
      resumeId: sourceResume.id,
      resumeTitle: sourceResume.title,
      report,
      updatedAt: new Date().toISOString(),
    });
    navigateTo("optimizer");
    setMessage("已带入岗位 JD、来源简历和匹配报告；确认后即可生成岗位定制版。");
  }

  function blacklistOpportunityCompany(opportunityId: string) {
    const opportunity = opportunities.find((item) => item.id === opportunityId);
    if (!opportunity) return;
    setOpportunities((current) => applyCompanyBlacklist(current, opportunityId, {
      reason: "用户从机会操作条拉黑，不再推进该公司机会",
    }));
    setMessage(`已将“${opportunity.job.company}”加入公司黑名单；历史机会仍保留，可随时恢复。`, "warning");
  }

  function restoreOpportunityCompany(opportunityId: string) {
    const opportunity = opportunities.find((item) => item.id === opportunityId);
    if (!opportunity) return;
    setOpportunities((current) => restoreCompanyBlacklist(current, opportunityId));
    setMessage(`已恢复“${opportunity.job.company}”的公司机会。`);
  }

  function openInterviewPackage(opportunityId: string) {
    setInterviewOpportunityId(opportunityId);
    navigateTo("agent");
  }

  function openOpportunity(opportunityId: string) {
    setInterviewOpportunityId("");
    setIntegrationSection("funnel");
    navigateTo("integration");
    window.setTimeout(() => document.getElementById(`opportunity-${opportunityId}-title`)?.scrollIntoView({ block: "center" }), 0);
  }

  function openIntegrationSection(section: IntegrationSection) {
    setInterviewOpportunityId("");
    setIntegrationSection(section);
    setMobilePanel(null);
    navigateTo("integration");
  }

  function analyzeOpportunity(opportunity: OpportunityCenterRecord) {
    setJobDraft({
      company: opportunity.job.company,
      title: opportunity.job.title,
      description: opportunity.job.description,
    });
    setMatchPreview(undefined);
    const linkedResume = resumes.find((resume) => resume.id === opportunity.resumeId);
    if (linkedResume) setSelectedResumeId(linkedResume.id);
    if (!resumes.length) {
      navigateTo("profile");
      setMessage("已带入机会 JD。请先完善经历库并生成一份基础简历。", "warning");
      return;
    }
    navigateTo("optimizer");
    setMessage(`已带入“${opportunity.job.company} · ${opportunity.job.title}”的 JD。`);
  }

  function useBossJobForMatching(job: BossJobRecord) {
    setJobDraft({
      company: job.company,
      title: job.title,
      description: job.description || `${job.company} ${job.title}。${job.experience} ${job.education}`.trim(),
    });
    setMatchPreview(undefined);
    if (!resumes.length) {
      navigateTo("profile");
      setMessage("已带入 BOSS 职位。请先完善经历库并生成一份基础简历。", "warning");
      return;
    }
    navigateTo("optimizer");
    setMessage(`已带入“${job.company} · ${job.title}”，可开始检查匹配结果。`);
  }
  function navigateTo(tab: TabId) {
    setActiveTab(tab);
    setNavExpanded(false);
    setMobilePanel(null);
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }

  if (!workspaceReady) {
    return (
      <div className="app-shell workspace-loading-shell">
        <main className="workspace-loading" role="status" aria-live="polite">
          <div className="workspace-loading__mark">帆</div>
          <strong>正在恢复你的求职工作区</strong>
          <p>从本机服务器读取简历、职位和投递记录；如果服务器不可用，将自动使用浏览器缓存。</p>
          <span className="workspace-loading__bar" aria-hidden="true" />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header ref={siteHeaderRef} className="site-header">
        <div className="site-header__identity">
        <div className="brand-lockup">
          <div className="brand-mark">帆</div>
          <div>
            <strong>职启云帆</strong>
            <span>求职成长工作台</span>
          </div>
        </div>
        <div className="header-person"><span>{(profile.name || "我").slice(0, 1)}</span><div><strong>{profile.name || "我的工作台"}</strong><small>{profile.targetRole || "下一站，正在准备"}</small></div></div>
        <button className="nav-toggle secondary-button" type="button" aria-label={navExpanded ? "收起导航" : "展开导航"} aria-expanded={navExpanded} aria-controls="primary-navigation" onClick={() => setNavExpanded((open) => !open)}>
          {navExpanded ? <X size={20} /> : <Menu size={20} />}<span>导航</span>
        </button>
        </div>
        <nav
          id="primary-navigation"
          className={`nav-list ${navExpanded ? "nav-list--expanded" : ""}`}
          aria-label="主导航"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setNavExpanded(false);
              setMobilePanel(null);
              document.querySelector<HTMLButtonElement>(".nav-toggle")?.focus();
            }
          }}
        >
          <div className="desktop-nav-groups">
            <section className="nav-group" aria-label="今日">
              <span className="nav-group__label">今日</span>
              <NavButton active={activeTab === "workspace"} icon={<CalendarDays size={18} />} onClick={() => navigateTo("workspace")}>今日</NavButton>
            </section>
            <section className="nav-group" aria-label="机会">
              <span className="nav-group__label">机会</span>
              <NavButton active={activeTab === "integration"} icon={<Target size={18} />} onClick={() => openIntegrationSection("funnel")}>机会中心</NavButton>
              <NavButton active={activeTab === "applications"} icon={<BriefcaseBusiness size={18} />} onClick={() => navigateTo("applications")}>跟进</NavButton>
            </section>
            <section className="nav-group" aria-label="材料">
              <span className="nav-group__label">材料</span>
              <NavButton active={activeTab === "profile"} icon={<Library size={18} />} onClick={() => navigateTo("profile")}>经历库</NavButton>
              <NavButton active={activeTab === "builder"} icon={<FileText size={18} />} onClick={() => navigateTo("builder")}>简历版本</NavButton>
              <NavButton active={activeTab === "templates"} icon={<Shapes size={18} />} onClick={() => navigateTo("templates")}>模板与提纲</NavButton>
              <NavButton active={activeTab === "optimizer"} icon={<Search size={18} />} onClick={() => navigateTo("optimizer")}>JD 匹配</NavButton>
            </section>
            <section className="nav-group" aria-label="准备">
              <span className="nav-group__label">准备</span>
              <NavButton active={activeTab === "agent"} icon={<ScanSearch size={18} />} onClick={() => navigateTo("agent")}>岗位分析与准备</NavButton>
            </section>
          </div>

          <div className="mobile-nav-shortcuts">
            <NavButton active={activeTab === "workspace"} icon={<CalendarDays size={18} />} onClick={() => navigateTo("workspace")}>今日</NavButton>
            <NavButton active={activeTab === "integration"} icon={<Target size={18} />} onClick={() => openIntegrationSection("funnel")}>机会</NavButton>
            <NavButton active={activeTab === "applications"} icon={<ListTodo size={18} />} onClick={() => navigateTo("applications")}>跟进</NavButton>
            <button className={`nav-button mobile-nav-disclosure ${activeTab === "profile" || activeTab === "builder" || activeTab === "templates" || activeTab === "optimizer" ? "nav-button--active" : ""}`} type="button" aria-expanded={mobilePanel === "materials"} onClick={() => setMobilePanel((current) => current === "materials" ? null : "materials")}>
              <FileText size={18} /><span>材料</span><ChevronDown size={16} aria-hidden="true" />
            </button>
            <button className="nav-button mobile-nav-disclosure" type="button" aria-expanded={mobilePanel === "more"} onClick={() => setMobilePanel((current) => current === "more" ? null : "more")}>
              <MoreHorizontal size={18} /><span>更多任务</span><ChevronDown size={16} aria-hidden="true" />
            </button>

            {mobilePanel === "materials" ? (
              <div className="mobile-task-panel" aria-label="材料任务">
                <strong>材料工作区</strong>
                <button type="button" onClick={() => navigateTo("profile")}>经历库</button>
                <button type="button" onClick={() => navigateTo("builder")}>简历版本 · 默认</button>
                <button type="button" onClick={() => navigateTo("templates")}>模板与提纲</button>
                <button type="button" onClick={() => navigateTo("optimizer")}>JD 匹配</button>
              </div>
            ) : null}
            {mobilePanel === "more" ? (
              <div className="mobile-task-panel" aria-label="更多任务">
                <strong>更多任务</strong>
                <button type="button" onClick={() => navigateTo("agent")}>岗位分析</button>
              </div>
            ) : null}
          </div>
        </nav>
      </header>

      <main className="main-stage" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <div>
            <h1>{pageCopy[activeTab].title}</h1>
            <p className="page-description">{pageCopy[activeTab].description}</p>
          </div>
          <div className="topbar-actions">
            <button
              className="secondary-button"
              type="button"
              aria-label="AI 服务配置"
              onClick={() => openIntegrationSection("settings")}
            >
              <Settings size={17} />
              AI 服务配置
            </button>
          </div>
        </header>

        {workspaceConflict ? (
          <div className="workspace-conflict" role="alert">
            <strong>发现另一台设备的更新</strong>
            <p>当前浏览器中的修改没有丢失。请选择要保留的版本。</p>
            <div className="workspace-conflict__actions">
              <button className="primary-button" type="button" onClick={keepLocalWorkspaceVersion}>保留本地并覆盖服务器</button>
              <button className="ghost-button" type="button" onClick={loadServerWorkspaceVersion}>载入服务器版本</button>
            </div>
          </div>
        ) : null}

        {message ? <StatusMessage text={message.text} type={message.type} /> : null}

        {activeTab === "integration" ? (
          <IntegrationCenter
            section={integrationSection}
            selectedResume={selectedResume}
            onSectionChange={setIntegrationSection}
            onGo={navigateTo}
            onUseJob={useBossJobForMatching}
            onAddJobToFunnel={addBossJobToFunnel}
            opportunities={opportunityCenterRecords}
            savedViews={jobPool.savedViews}
            onDeleteSavedView={deleteOpportunityView}
            opportunityHandlers={{
              onAdvance: advanceOpportunity,
              onMarkUnsuitable: markOpportunityUnsuitable,
              onUndo: undoOpportunityExit,
              onScheduleFollowUp: rescheduleOpportunityAction,
              onCompleteFollowUp: completeOpportunityAction,
              onConfirmImport: confirmOpportunityImport,
              onOpenInterviewPackage: openInterviewPackage,
              onAnalyze: analyzeOpportunity,
              onMatchJd: analyzeOpportunity,
              onSelectResume: attachSelectedResumeToOpportunity,
              onGenerateResume: prepareOpportunityResume,
              onBlacklist: blacklistOpportunityCompany,
              onRestoreBlacklist: restoreOpportunityCompany,
              onSaveView: saveOpportunityView,
            }}
          />
        ) : null}

        {activeTab === "templates" ? <TemplateLibrary selectedTemplate={selectedResume?.template ?? "graduate"} onSelectTemplate={chooseLibraryTemplate} /> : null}

        {activeTab === "workspace" ? (
          <WorkspaceView
            applications={applications}
            latestApplication={latestApplication}
            profile={profile}
            resumes={resumes}
            onGenerate={handleGenerateResume}
            onGo={navigateTo}
            onLoadSampleUser={loadSampleUser}
            onRunDemoFlow={runDemoFlow}
            todayTasks={todayTasks}
            todayInterviews={todayInterviews}
            todayOpportunities={todayOpportunities}
            onCompleteTodayTask={(taskId) => {
              const [opportunityId, actionId] = taskId.split("::");
              if (opportunityId && actionId) completeOpportunityAction(opportunityId, actionId);
            }}
            onOpenTodayTask={(task) => {
              if (!task.opportunityId) return;
              if (task.kind === "interview") openInterviewPackage(task.opportunityId);
              else openOpportunity(task.opportunityId);
            }}
            onOpenOpportunity={openOpportunity}
            onOpenInterviewPackage={openInterviewPackage}
          />
        ) : null}

        {activeTab === "agent" ? (
          currentInterviewOpportunity && currentInterviewPackage ? (
            <div className="stack interview-package-view">
              <div className="interview-package-view__bar">
                <button className="ghost-button" type="button" onClick={() => openOpportunity(currentInterviewOpportunity.id)}>
                  <ChevronDown size={17} />返回机会
                </button>
                <span>从机会记录生成的规则面试包</span>
              </div>
              <InterviewPackage
                opportunityId={currentInterviewOpportunity.id}
                job={{
                  company: currentInterviewOpportunity.job.company,
                  title: currentInterviewOpportunity.job.title,
                  description: currentInterviewOpportunity.job.description,
                  location: currentInterviewOpportunity.job.location,
                  interviewAt: currentInterviewApplication?.interviewAt,
                  format: "video",
                }}
                resume={currentInterviewResume ?? null}
                match={currentInterviewApplication ? {
                  score: currentInterviewApplication.report.score,
                  strengths: currentInterviewApplication.report.strengths,
                  gaps: currentInterviewApplication.report.gaps,
                } : undefined}
                rules={[
                  ...currentInterviewPackage.projectStories.map((summary, index) => ({
                    id: `story-${index}`,
                    title: `证据故事 ${index + 1}`,
                    summary,
                    basis: "rule" as const,
                  })),
                  ...currentInterviewPackage.riskReminders.map((summary, index) => ({
                    id: `risk-${index}`,
                    title: "表达边界",
                    summary,
                    basis: "rule" as const,
                  })),
                ]}
                questions={currentInterviewPackage.likelyQuestions}
                checklist={currentInterviewPackage.preparationChecklist.map((title, index) => ({
                  id: `check-${index}`,
                  title,
                  completed: false,
                }))}
                onNavigate={navigateTo}
                onOpenResume={() => navigateTo("builder")}
              />
            </div>
          ) : (
            <AgentWorkspace
              profile={profile}
              resumes={resumes}
              selectedResumeId={selectedResumeId}
              onSelectResume={setSelectedResumeId}
            />
          )
        ) : null}

        {activeTab === "profile" ? (
          <ProfileView
            profile={profile}
            setProfileTemplate={setProfileTemplate}
            updateProfile={updateProfile}
            onGenerate={handleGenerateResume}
          />
        ) : null}

        {activeTab === "builder" ? (
          <BuilderView
            pasteText={pasteText}
            pasteTitle={pasteTitle}
            importDraft={importDraft}
            profile={profile}
            renameDraft={renameDraft}
            resumes={resumes}
            selectedResume={selectedResume}
            onCopy={copyResume}
            onDelete={deleteResume}
            onExport={exportResume}
            onExportPdf={exportResumePdf}
            onGenerate={handleGenerateResume}
            onCancelImport={cancelPastedResumeImport}
            onConfirmImport={confirmPastedResumeImport}
            onImportDraftChange={setImportDraft}
            onPreviewImport={previewPastedResumeImport}
            onMarkReviewed={markReviewed}
            onRename={renameResume}
            onSelectResume={setSelectedResumeId}
            onTemplateChange={updateResumeTemplate}
            onUpdateResume={updateResumeContent}
            onGo={navigateTo}
            setPasteText={updatePasteText}
            setPasteTitle={updatePasteTitle}
            setRenameDraft={setRenameDraft}
          />
        ) : null}

        {activeTab === "optimizer" ? (
          <OptimizerView
            applications={applications}
            jobDraft={jobDraft}
            matchPreview={matchPreview}
            resumes={resumes}
            selectedResume={selectedResume}
            onAnalyze={handleAnalyzePreview}
            onClearJob={clearJobDraft}
            onGenerateCustomizedResume={generateCustomizedResumeFromPreview}
            onPasteJobDescription={pasteJobDescriptionFromClipboard}
            onSaveApplication={saveMatchAsApplication}
            onSelectResume={selectResumeForMatching}
            onUseSampleJob={useSampleJob}
            setJobDraft={updateJobDraft}
          />
        ) : null}

        {activeTab === "applications" ? (
          <ApplicationsView
            applications={applications}
            resumes={resumes}
            opportunities={opportunities}
            onDelete={deleteApplication}
            onDetailsChange={updateApplicationDetails}
            onRecalculate={recalculateApplication}
            onStatusChange={updateApplicationStatus}
            onCompleteNextAction={completeOpportunityAction}
            onRescheduleNextAction={rescheduleOpportunityAction}
            onOpenInterviewPackage={openInterviewPackage}
          />
        ) : null}
      </main>
    </div>
  );
}
