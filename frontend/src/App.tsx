import {
  AlertTriangle,
  ScanSearch,
  BriefcaseBusiness,
  Cable,
  Download,
  LayoutDashboard,
  Library,
  Search,
  Settings,
  Upload,
  FileText,
  Shapes,
  Menu,
  X,
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
  clearWorkspaceSyncMeta,
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
  ResumeContentPatch,
  ResumeImportDraft,
  ResumeTemplate,
  ResumeVersion,
  TabId,
} from "./types";
import { AgentWorkspace } from "./components/AgentWorkspace";
import { IntegrationCenter } from "./components/IntegrationCenter";
import { TemplateLibrary } from "./components/TemplateLibrary";
import { ApplicationsView, BuilderView, OptimizerView, ProfileView, WorkspaceView } from "./views";

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
  const [workspaceSync, setWorkspaceSync] = useState<"connecting" | "saved" | "error">("connecting");
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceConflict, setWorkspaceConflict] = useState<WorkspaceEnvelope | undefined>();
  const [activeTab, setActiveTab] = useState<TabId>("workspace");
  const [navExpanded, setNavExpanded] = useState(false);
  const [profile, setProfile] = useState<CandidateProfile>(storedState.profile);
  const [resumes, setResumes] = useState<ResumeVersion[]>(storedState.resumes);
  const [applications, setApplications] = useState<ApplicationRecord[]>(storedState.applications);
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
    () => createStoredPayload(profile, resumes, applications),
    [applications, profile, resumes],
  );

  function setMessage(text: string, type: StatusMessageType = "success") {
    setMessageState({ id: Date.now(), text, type });
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(createStoredPayload(profile, resumes, applications)));
      if (workspaceReady && !skipWorkspaceSave.current && !suppressNextWorkspaceSave.current) {
        markWorkspaceDirty(workspaceRevision.current);
      }
    } catch (error) {
      console.error("Failed to save local 职启云帆 data", error);
      setMessage("本地保存失败：浏览器存储可能已满、被隐私模式限制，或简历文本过长。请先导出数据备份。", "error");
    }
  }, [applications, profile, resumes]);
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
            setWorkspaceSync("error");
            suppressNextWorkspaceSave.current = suppressInitialAutosave;
            setWorkspaceReady(true);
            return;
          }
          if (!localSync.dirty) {
            const restored = normalizeStoredState(remote.state);
            setProfile(restored.profile);
            setResumes(restored.resumes);
            setApplications(restored.applications);
            setSelectedResumeId(restored.resumes[0]?.id ?? "");
            markWorkspaceClean(remote.revision);
            setWorkspaceSync("saved");
          } else {
            markWorkspaceDirty(remote.revision);
            setWorkspaceSync("connecting");
            suppressInitialAutosave = false;
          }
        } else {
          const created = await workspaceApi.save(
            createStoredPayload(profile, resumes, applications),
            null,
          );
          if (cancelled) return;
          workspaceRevision.current = created.revision;
          markWorkspaceClean(created.revision);
          setWorkspaceSync("saved");
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
        setWorkspaceSync("error");
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
        setWorkspaceSync("saved");
        return true;
      } catch (error) {
        setWorkspaceSync("error");
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
    setWorkspaceSync("connecting");
    void saveWorkspaceSnapshot(workspaceConflict.revision);
  }

  function loadServerWorkspaceVersion() {
    if (!workspaceConflict) return;
    const restored = normalizeStoredState(workspaceConflict.state);
    suppressNextWorkspaceSave.current = true;
    setProfile(restored.profile);
    setResumes(restored.resumes);
    setApplications(restored.applications);
    setSelectedResumeId(restored.resumes[0]?.id ?? "");
    workspaceRevision.current = workspaceConflict.revision;
    workspaceSyncBlocked.current = false;
    markWorkspaceClean(workspaceConflict.revision);
    setWorkspaceConflict(undefined);
    setWorkspaceSync("saved");
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
      setMessage("已更新同公司同岗位的投递记录，没有重复新增。");
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
    setMessage("已保存为投递记录，后续可在投递管理里补充渠道、跟进时间和备注。");
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
    setResumes((current) =>
      current
        .filter((resume) => resume.id !== id)
        .map((resume) =>
          resume.parentResumeId === id ? { ...resume, parentResumeId: undefined, updatedAt: now } : resume,
        ),
    );
    setApplications((current) => current.filter((application) => application.resumeId !== id));
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
    setApplications((current) => current.filter((application) => application.id !== id));
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
    setApplications((current) =>
      current.map((application) =>
        application.id === id ? { ...application, status, updatedAt: new Date().toISOString() } : application,
      ),
    );
  }

  function updateApplicationDetails(
    id: string,
    patch: Partial<Pick<ApplicationRecord, "appliedAt" | "channel" | "hrContact" | "followUpAt" | "interviewAt" | "notes">>,
  ) {
    setApplications((current) =>
      current.map((application) =>
        application.id === id ? { ...application, ...patch, updatedAt: new Date().toISOString() } : application,
      ),
    );
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

  function exportResumePdf(resume: ResumeVersion) {
    if (!resume.reviewed) {
      setMessage("请先勾选“我已核对”，再打开打印/保存 PDF。", "warning");
      return;
    }
    try {
      printResumeAsPdf(profile, resume);
      setMessage("已打开浏览器打印窗口，请在打印目标里选择“另存为 PDF”或“保存为 PDF”。");
    } catch {
      setMessage("浏览器拦截了打印窗口，请允许弹窗后再试。", "warning");
    }
  }

  function exportDataBackup() {
    const payload = createStoredPayload(profile, resumes, applications);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zhiqi-yunfan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("已导出本地数据备份 JSON。换浏览器或换电脑时，可用它恢复经历库、简历版本和投递记录。");
  }

  async function importDataBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const ok = window.confirm("导入备份会覆盖当前浏览器里的经历库、简历版本和投递记录。确定继续吗？");
    if (!ok) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!looksLikeStoredPayload(parsed)) {
        throw new Error("Invalid backup shape");
      }
      const restored = normalizeStoredState(parsed);
      setProfile(restored.profile);
      setResumes(restored.resumes);
      setApplications(restored.applications);
      setSelectedResumeId(restored.resumes[0]?.id ?? "");
      navigateTo("workspace");
      setMessage("已导入数据备份，并完成结构校验。");
    } catch {
      setMessage("导入失败：请选择有效的职启云帆 JSON 备份文件。", "error");
    }
  }

  function clearLocalData() {
    const ok = window.confirm("确定清空简历、经历库和投递记录吗？API 配置与 BOSS 职位池会保留。");
    if (!ok) {
      return;
    }

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures; resetting React state is enough for the current page.
    }
    setProfile(DEFAULT_PROFILE);
    setResumes([]);
    setApplications([]);
    clearWorkspaceSyncMeta();
    setSelectedResumeId("");
    setJobDraft(EMPTY_JOB);
    setPasteTitle("我的已有简历");
    setPasteText("");
    navigateTo("workspace");
    setMessage("已清空简历、经历库和投递记录；服务器将同步这次更改。");
  }

  const pageCopy: Record<TabId, { title: string; description: string }> = {
    workspace: { title: "让好经历，有个好开场。", description: "这里是你的求职成长工作台。把经历、简历和每一次机会慢慢整理好。" },
    integration: { title: "把 BOSS 里的机会，带回自己的桌面。", description: "安装扩展、配置个人 API，再把当前页面可见的职位带入本机匹配和跟进流程。" },
    agent: { title: "把目标岗位，看得更清楚。", description: "从岗位要求到真实经历，找到值得表达的优势和下一步准备方向。" },
    profile: { title: "先把做过的事，写下来。", description: "课程项目、实习和个人作品，都是你自己的素材。" },
    builder: { title: "一份简历，一个合适的版本。", description: "专心编辑，随时预览。把最能说明你的经历放在前面。" },
    optimizer: { title: "给这次投递，多一点针对性。", description: "用本地规则核对关键词，再用自己的事实判断取舍。" },
    applications: { title: "每一个机会，都有后续。", description: "记录投递、准备面试，也为下一次沟通留好线索。" },
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
        <nav id="primary-navigation" className={`nav-list ${navExpanded ? "nav-list--expanded" : ""}`} aria-label="主导航" onKeyDown={(event) => { if (event.key === "Escape") { setNavExpanded(false); document.querySelector<HTMLButtonElement>(".nav-toggle")?.focus(); } }}>
          <NavButton active={activeTab === "workspace"} icon={<LayoutDashboard size={18} />} onClick={() => navigateTo("workspace")}>
            工作台
          </NavButton>
          <NavButton active={activeTab === "integration"} icon={<Cable size={18} />} onClick={() => navigateTo("integration")}>
            BOSS 接入
          </NavButton>
          <NavButton active={activeTab === "agent"} icon={<ScanSearch size={18} />} onClick={() => navigateTo("agent")}>
            岗位分析与准备
          </NavButton>
          <NavButton active={activeTab === "profile"} icon={<Library size={18} />} onClick={() => navigateTo("profile")}>
            经历库
          </NavButton>
          <NavButton active={activeTab === "builder"} icon={<FileText size={18} />} onClick={() => navigateTo("builder")}>
            简历版本
          </NavButton>
          <NavButton active={activeTab === "templates"} icon={<Shapes size={18} />} onClick={() => navigateTo("templates")}>
            模板与提纲
          </NavButton>
          <NavButton active={activeTab === "optimizer"} icon={<Search size={18} />} onClick={() => navigateTo("optimizer")}>
            JD 匹配（本地规则）
          </NavButton>
          <NavButton active={activeTab === "applications"} icon={<BriefcaseBusiness size={18} />} onClick={() => navigateTo("applications")}>
            投递管理
          </NavButton>
        </nav>
      </header>

      <main className="main-stage" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <div>
            <h1>{pageCopy[activeTab].title}</h1>
            <p className="page-description">{pageCopy[activeTab].description}</p>
          </div>
          <div className="topbar-actions">
            <details className="data-settings">
              <summary aria-label="数据设置">
                <Settings size={17} />
                数据设置
              </summary>
              <div className="data-settings__menu">
                <p className="data-settings__help">简历与投递会同步到本机 Docker 中的 SQLite；API Key 只保存在当前浏览器。当前状态：{workspaceConflict ? "服务器有更新，本地修改已保留" : workspaceSync === "saved" ? "服务器已同步" : workspaceSync === "error" ? "服务器暂不可用，已保存本地副本" : "正在连接服务器"}。</p>
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
                <button className="ghost-button" type="button" onClick={exportDataBackup}>
                  <Download size={17} />
                  导出数据备份
                </button>
                <label className="ghost-button file-button">
                  <Upload size={17} />
                  导入数据备份
                  <input type="file" accept="application/json,.json" onChange={importDataBackup} />
                </label>
                <div className="danger-zone">
                  <strong>危险操作</strong>
                  <button className="destructive-button" type="button" onClick={clearLocalData}>
                    <AlertTriangle size={17} />
                    清空简历与投递
                  </button>
                </div>
              </div>
            </details>
          </div>
        </header>

        {message ? <StatusMessage text={message.text} type={message.type} /> : null}

        {activeTab === "integration" ? (
          <IntegrationCenter
            selectedResume={selectedResume}
            onGo={navigateTo}
            onUseJob={useBossJobForMatching}
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
          />
        ) : null}

        {activeTab === "agent" ? (
          <AgentWorkspace
            profile={profile}
            resumes={resumes}
            selectedResumeId={selectedResumeId}
            onSelectResume={setSelectedResumeId}
          />
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
            onDelete={deleteApplication}
            onDetailsChange={updateApplicationDetails}
            onRecalculate={recalculateApplication}
            onStatusChange={updateApplicationStatus}
          />
        ) : null}
      </main>
    </div>
  );
}
