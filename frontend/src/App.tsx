import {
  AlertTriangle,
  ScanSearch,
  BriefcaseBusiness,
  Download,
  LayoutDashboard,
  Library,
  Search,
  Settings,
  Upload,
  FileText,
  Shapes,
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { DEFAULT_PROFILE, EMPTY_JOB, SAMPLE_FRONTEND_JOB } from "./constants";
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
  const [activeTab, setActiveTab] = useState<TabId>("workspace");
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
    text: "欢迎回到求职作品室，你的简历与投递会自动保存在当前浏览器。",
    type: "success",
  });

  const selectedResume = useMemo(
    () => resumes.find((resume) => resume.id === selectedResumeId) ?? resumes[0],
    [resumes, selectedResumeId],
  );
  const latestApplication = applications[0];

  function setMessage(text: string, type: StatusMessageType = "success") {
    setMessageState({ id: Date.now(), text, type });
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(createStoredPayload(profile, resumes, applications)));
    } catch (error) {
      console.error("Failed to save local JobFit data", error);
      setMessage("本地保存失败：浏览器存储可能已满、被隐私模式限制，或简历文本过长。请先导出数据备份。", "error");
    }
  }, [applications, profile, resumes]);

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
      setActiveTab("profile");
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
    setActiveTab("builder");
    setMessage("已根据经历库生成一份基础简历。下一步可以去 JD 匹配，或在简历版本里继续编辑。");
    return resume;
  }

  function loadSampleUser() {
    setProfile(DEFAULT_PROFILE);
    setActiveTab("profile");
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
    setActiveTab("applications");
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
      setActiveTab("builder");
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
    setActiveTab("optimizer");
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

    setResumes((current) =>
      current.map((resume) =>
        resume.id === id
          ? {
              ...resume,
              ...patch,
              sections,
              plainText,
              unsupportedClaims,
              reviewed: false,
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
      current.map((resume) =>
        resume.id === id ? { ...resume, template, updatedAt: new Date().toISOString() } : resume,
      ),
    );
    setMessage("简历模板已切换，导出前请重新检查排版。");
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
    link.download = `jobfit-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
      setActiveTab("workspace");
      setMessage("已导入数据备份，并完成结构校验。");
    } catch {
      setMessage("导入失败：请选择有效的 JobFit AI JSON 备份文件。", "error");
    }
  }

  function clearLocalData() {
    const ok = window.confirm("确定清空本地数据吗？经历库、简历版本和投递记录都会恢复为初始状态。");
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
    setSelectedResumeId("");
    setJobDraft(EMPTY_JOB);
    setPasteTitle("我的已有简历");
    setPasteText("");
    setActiveTab("workspace");
    setMessage("已清空本地数据，并恢复示例经历库。");
  }

  const pageCopy: Record<TabId, { title: string; description: string }> = {
    workspace: { title: "让好经历，有个好开场。", description: "这里是你的求职作品室。把经历、简历和每一次机会慢慢整理好。" },
    agent: { title: "把目标岗位，看得更清楚。", description: "从岗位要求到真实经历，找到值得表达的优势和下一步准备方向。" },
    profile: { title: "先把做过的事，写下来。", description: "课程项目、实习和个人作品，都是你自己的素材。" },
    builder: { title: "一份简历，一个合适的版本。", description: "边写边看，把最能说明你的经历放在前面。" },
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
    setActiveTab("builder");
    setMessage("已应用简历版式，经历内容保持原样。");
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">JF</div>
          <div>
            <strong>JobFit</strong>
            <span>求职作品室</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="主导航">
          <NavButton active={activeTab === "workspace"} icon={<LayoutDashboard size={18} />} onClick={() => setActiveTab("workspace")}>
            工作台
          </NavButton>
          <NavButton active={activeTab === "agent"} icon={<ScanSearch size={18} />} onClick={() => setActiveTab("agent")}>
            岗位分析与准备
          </NavButton>
          <NavButton active={activeTab === "profile"} icon={<Library size={18} />} onClick={() => setActiveTab("profile")}>
            经历库
          </NavButton>
          <NavButton active={activeTab === "builder"} icon={<FileText size={18} />} onClick={() => setActiveTab("builder")}>
            简历版本
          </NavButton>
          <NavButton active={activeTab === "templates"} icon={<Shapes size={18} />} onClick={() => setActiveTab("templates")}>
            模板与提纲
          </NavButton>
          <NavButton active={activeTab === "optimizer"} icon={<Search size={18} />} onClick={() => setActiveTab("optimizer")}>
            JD 匹配（本地规则）
          </NavButton>
          <NavButton active={activeTab === "applications"} icon={<BriefcaseBusiness size={18} />} onClick={() => setActiveTab("applications")}>
            投递管理
          </NavButton>
        </nav>
        <div className="sidebar-person"><span>{(profile.name || "我").slice(0, 1)}</span><div><strong>{profile.name || "我的作品室"}</strong><small>{profile.targetRole || "下一站，正在准备"}</small></div></div>
        <details className="sidebar-note"><summary>数据与运行方式</summary><p>简历与投递保存在本浏览器；岗位分析使用本地 Python 服务，页面会显示实际模型模式。</p></details>
      </aside>

      <section className="main-stage" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <div>
            <h1>{pageCopy[activeTab].title}</h1>
            <p className="page-description">{pageCopy[activeTab].description}</p>
          </div>
          <div className="topbar-actions">
            <details className="data-settings">
              <summary>
                <Settings size={17} />
                数据设置
              </summary>
              <div className="data-settings__menu">
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
                    清空所有数据
                  </button>
                </div>
              </div>
            </details>
          </div>
        </header>

        {message ? <StatusMessage text={message.text} type={message.type} /> : null}

        {activeTab === "templates" ? <TemplateLibrary selectedTemplate={selectedResume?.template ?? "graduate"} onSelectTemplate={chooseLibraryTemplate} /> : null}

        {activeTab === "workspace" ? (
          <WorkspaceView
            applications={applications}
            latestApplication={latestApplication}
            profile={profile}
            resumes={resumes}
            onGenerate={handleGenerateResume}
            onGo={setActiveTab}
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
            onGo={setActiveTab}
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
      </section>
    </main>
  );
}
