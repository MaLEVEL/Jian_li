import { describe, expect, it } from "vitest";
import type { ApplicationRecord, OpportunityRecord, ResumeVersion } from "./types";
import {
  APPROVED_OPPORTUNITY_STAGES,
  calculateFunnelStats,
  applyCompanyBlacklist,
  createDefaultNextAction,
  createManualOpportunity,
  createOpportunitySourceKey,
  createOpportunityStableId,
  findSimilarOpportunities,
  generateRuleBasedInterviewPackage,
  getCompanyBlacklistStates,
  getDefaultNextActionDefinition,
  groupApplicationTasks,
  normalizeOpportunityRecord,
  parseOpportunityCsv,
  restoreCompanyBlacklist,
  upsertOpportunity,
} from "./opportunityPipeline";
import { createStoredPayload, normalizeStoredState, STORAGE_VERSION } from "./storage";

const NOW = "2026-11-19T12:00:00.000+08:00";

function manualInput(overrides: Partial<Parameters<typeof createManualOpportunity>[0]> = {}) {
  return {
    company: "云帆科技",
    title: "AI 产品实习生",
    description: "负责 Agent 产品需求分析、数据分析和跨团队沟通。",
    ...overrides,
  };
}

function opportunity(overrides: Partial<OpportunityRecord> = {}): OpportunityRecord {
  return {
    id: "opportunity-a",
    stage: "applied",
    job: {
      company: "云帆科技",
      title: "AI 产品实习生",
      description: "React TypeScript Agent 产品",
      location: "上海",
    },
    source: "manual",
    sourceUrl: "https://jobs.example.com/roles/1",
    channel: "官网",
    contact: "王女士",
    notes: "",
    applicationId: "application-a",
    createdAt: NOW,
    updatedAt: NOW,
    stageChangedAt: NOW,
    nextAction: {
      id: "action-a",
      kind: "follow-up",
      title: "跟进招聘进展",
      dueAt: "2026-11-19T10:00:00.000+08:00",
      createdAt: NOW,
    },
    ...overrides,
  };
}

function application(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: "application-a",
    job: { company: "云帆科技", title: "AI 产品实习生", description: "React TypeScript Agent 产品" },
    status: "applied",
    appliedAt: "2026-11-18",
    channel: "官网",
    hrContact: "王女士",
    followUpAt: "",
    interviewAt: "",
    notes: "",
    resumeId: "resume-a",
    resumeTitle: "AI 产品简历",
    report: {
      score: 82,
      weightedCoverage: 80,
      skillCoverage: 75,
      projectCoverage: 85,
      matchedKeywords: ["React", "TypeScript"],
      missingKeywords: ["GraphQL", "埋点分析"],
      scoreBreakdown: [],
      strengths: [],
      gaps: [],
      suggestions: [],
      optimizedBullets: [],
    },
    questions: { technical: [], project: [], behavioral: [] },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("opportunity model and stable identity", () => {
  it("exposes exactly the approved nine stages", () => {
    expect(APPROVED_OPPORTUNITY_STAGES).toEqual([
      "new",
      "saved",
      "tailoring",
      "applied",
      "communicating",
      "interviewing",
      "offer",
      "unsuitable",
      "closed",
    ]);
  });

  it("creates normalized stable IDs for manual entries without changing display text", () => {
    const first = createManualOpportunity(
      manualInput({
        company: " 云帆  科技 ",
        title: " AI 产品实习生 ",
        location: " 上海 ",
        url: "https://jobs.example.com/roles/1?from=feed",
      }),
      { now: NOW },
    );
    const second = createManualOpportunity(
      manualInput({
        company: "云帆 科技",
        title: "ai 产品实习生",
        location: "上海",
        url: "HTTPS://JOBS.EXAMPLE.COM/roles/1?from=feed#apply",
      }),
      { now: "2026-11-20T10:00:00+08:00" },
    );

    expect(first.id).toBe(second.id);
    expect(first.job.company).toBe("云帆 科技");
    expect(first.stage).toBe("new");
    expect(first.nextAction?.kind).toBe("review");
    expect(createOpportunityStableId("csv", first)).not.toBe(first.id);
  });

  it("produces the same CSV ID from normalized company, title, location and URL", () => {
    const csv = [
      "company,title,description,location,url",
      " 云帆科技 , AI 产品实习生 ,负责产品, 上海 ,HTTPS://JOBS.EXAMPLE.COM/roles/1#apply",
    ].join("\n");
    const first = parseOpportunityCsv(csv, { now: NOW });
    const second = parseOpportunityCsv(csv, { now: "2026-12-01T09:00:00+08:00" });

    expect(first.records[0].id).toBe(second.records[0].id);
    expect(first.records[0].source).toBe("csv");
  });

  it("maps legacy opportunity stages while keeping every legacy application untouched", () => {
    const legacy = normalizeOpportunityRecord({
      id: "legacy-opportunity",
      status: "preparing",
      job: { company: "云帆科技", title: "后端工程师", description: "Python FastAPI" },
      source: "workspace",
      updatedAt: NOW,
    }, { now: NOW });

    expect(legacy).not.toBeNull();
    expect(legacy?.stage).toBe("tailoring");

    const restored = normalizeStoredState({
      version: STORAGE_VERSION,
      profile: {},
      resumes: [],
      applications: [
        {
          id: "application-a",
          job: { company: "云帆科技", title: "后端工程师", description: "Python" },
          status: "screening",
          resumeId: "missing-resume",
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      opportunities: [],
    });

    expect(restored.applications).toHaveLength(0);
    expect(restored.opportunities).toHaveLength(0);
  });
});

describe("opportunity source keys, upsert and company blacklist rules", () => {
  it("uses URL, then source job ID, then the normalized job fallback", () => {
    const sameUrl = opportunity({
      id: "opportunity-url-a",
      source: "boss",
      sourceJobId: "job-a",
      sourceUrl: "https://jobs.example.com/roles/1?utm_source=feed&from=card",
    });
    const sameUrlWithDifferentCorrection = opportunity({
      id: "opportunity-url-b",
      source: "csv",
      sourceJobId: "job-b",
      sourceUrl: "https://jobs.example.com/roles/1?from=card&utm_source=feed#apply",
    });
    const sameSourceJob = opportunity({
      id: "opportunity-job-a",
      source: "boss",
      sourceJobId: "BOSS-42",
      sourceUrl: "",
    });
    const sameSourceJobWithDifferentDisplay = opportunity({
      id: "opportunity-job-b",
      source: "boss",
      sourceJobId: " boss-42 ",
      sourceUrl: "",
      job: { company: "云帆科技集团", title: "AI 产品经理", description: "另一份 JD", location: "上海" },
    });
    const fallback = opportunity({
      id: "opportunity-fallback-a",
      source: "manual",
      sourceJobId: "",
      sourceUrl: "",
      job: { company: " 云帆 科技 ", title: "AI 产品实习生", description: "旧 JD", location: " 上海 " },
    });
    const fallbackAgain = opportunity({
      id: "opportunity-fallback-b",
      source: "manual",
      sourceUrl: "",
      job: { company: "云帆 科技", title: "ai 产品实习生", description: "新 JD", location: "上海" },
    });
    const differentLocation = opportunity({
      id: "opportunity-fallback-c",
      source: "manual",
      sourceUrl: "",
      job: { company: "云帆 科技", title: "AI 产品实习生", description: "新 JD", location: "北京" },
    });

    expect(createOpportunitySourceKey(sameUrl)).toBe(createOpportunitySourceKey(sameUrlWithDifferentCorrection));
    expect(createOpportunitySourceKey(sameSourceJob)).toBe(createOpportunitySourceKey(sameSourceJobWithDifferentDisplay));
    expect(createOpportunitySourceKey(sameUrl)).not.toBe(createOpportunitySourceKey(sameSourceJob));
    expect(createOpportunitySourceKey(fallback)).toBe(createOpportunitySourceKey(fallbackAgain));
    expect(createOpportunitySourceKey(fallback)).not.toBe(createOpportunitySourceKey(differentLocation));
  });

  it("keeps same company/title/location records separate when no strong source identity exists", () => {
    const existing = opportunity({
      id: "opportunity-no-strong-a",
      source: "manual",
      sourceUrl: "",
      sourceJobId: "",
      job: { company: "云帆科技", title: "AI 产品实习生", description: "项目 A", location: "上海" },
    });
    const incoming = opportunity({
      id: "opportunity-no-strong-b",
      source: "manual",
      sourceUrl: "",
      sourceJobId: "",
      job: { company: "云帆科技", title: "AI 产品实习生", description: "项目 B，薪资与职级不同", location: "上海" },
    });

    const merged = upsertOpportunity([existing], incoming);

    expect(merged).toHaveLength(2);
    expect(merged.map((item) => item.job.description)).toEqual(["项目 A", "项目 B，薪资与职级不同"]);
  });

  it("upserts duplicate imports while preserving workflow state and taking the newer JD snapshot", () => {
    const existing = opportunity({
      id: "opportunity-existing",
      stage: "saved",
      source: "boss",
      sourceJobId: "job-77",
      sourceUrl: "",
      notes: "内推人：王女士",
      nextAction: {
        id: "action-saved",
        kind: "review",
        title: "判断是否投递",
        dueAt: "2026-11-21T09:00:00+08:00",
        createdAt: NOW,
      },
      updatedAt: "2026-11-19T12:00:00+08:00",
    });
    const incoming = opportunity({
      id: "opportunity-incoming",
      stage: "new",
      source: "boss",
      sourceJobId: "JOB-77",
      sourceUrl: "https://jobs.example.com/roles/77",
      job: {
        company: "云帆科技",
        title: "AI 产品实习生",
        description: "更新后的 JD，新增知识库检索与评测要求。",
        location: "上海",
      },
      notes: "",
      updatedAt: "2026-11-20T12:00:00+08:00",
      nextAction: undefined,
    });

    const merged = upsertOpportunity([existing], incoming, { now: "2026-11-20T13:00:00+08:00" });

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "opportunity-existing",
      stage: "saved",
      sourceJobId: "job-77",
      notes: "内推人：王女士",
      job: { description: "更新后的 JD，新增知识库检索与评测要求。" },
      nextAction: { id: "action-saved" },
    });
    expect(merged[0].updatedAt).toBe("2026-11-20T04:00:00.000Z");
  });

  it("applies and restores blacklist fields in a batch for the selected company", () => {
    const selected = opportunity({ id: "opportunity-b", job: { company: "云帆 科技", title: "数据分析实习生", description: "JD 2" } });
    const companyPeer = opportunity({ id: "opportunity-a", job: { company: "云帆科技", title: "AI 产品实习生", description: "JD 1" } });
    const otherCompany = opportunity({ id: "opportunity-c", job: { company: "星河科技", title: "产品运营", description: "JD 3" } });

    const blacklisted = applyCompanyBlacklist([selected, companyPeer, otherCompany], selected.id, {
      now: "2026-11-20T14:00:00+08:00",
      reason: "岗位方向不匹配",
    });
    const states = getCompanyBlacklistStates(blacklisted);
    const companyKey = [...states.keys()].find((key) => blacklisted.some((record) => record.id === selected.id && record.job.company.replace(/\s/g, "") === key));

    expect(blacklisted.filter((record) => record.id !== otherCompany.id)).toEqual([
      expect.objectContaining({
        blacklistedAt: "2026-11-20T06:00:00.000Z",
        blacklistReason: "岗位方向不匹配",
      }),
      expect.objectContaining({
        blacklistedAt: "2026-11-20T06:00:00.000Z",
        blacklistReason: "岗位方向不匹配",
      }),
    ]);
    expect(blacklisted[2].blacklistedAt).toBeUndefined();
    expect(companyKey).toBeDefined();
    expect(states.get(companyKey!)).toMatchObject({ blacklistReason: "岗位方向不匹配" });

    const restored = restoreCompanyBlacklist(blacklisted, selected.id, { now: "2026-11-20T15:00:00+08:00" });
    expect(restored.slice(0, 2).every((record) => !record.blacklistedAt && !record.blacklistReason)).toBe(true);
    expect(restored[2]).toEqual(otherCompany);
  });
});

describe("CSV parsing and preview", () => {
  it("parses Chinese headers, quoted commas and all approved optional fields", () => {
    const csv = [
      "\uFEFF公司,岗位,JD,地点,薪资,链接,状态,下一步,下一步时间,渠道,联系人,备注",
      '云帆科技,AI 产品实习生,"负责 Agent, 数据和沟通",上海,250/天,https://jobs.example.com/1,tailoring,补充项目数据,2026-11-20T09:30,官网,王女士,"一轮沟通, 需准备案例"',
    ].join("\n");

    const preview = parseOpportunityCsv(csv, { now: NOW });

    expect(preview.globalErrors).toEqual([]);
    expect(preview.canImport).toBe(true);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].record).toMatchObject({
      stage: "tailoring",
      source: "csv",
      job: {
        company: "云帆科技",
        title: "AI 产品实习生",
        description: "负责 Agent, 数据和沟通",
        location: "上海",
        salary: "250/天",
      },
      sourceUrl: "https://jobs.example.com/1",
      channel: "官网",
      contact: "王女士",
      notes: "一轮沟通, 需准备案例",
    });
    expect(preview.rows[0].record?.nextAction).toMatchObject({
      kind: "tailor-resume",
      title: "补充项目数据",
    });
  });

  it("ignores blank rows and reports row-specific contract errors", () => {
    const csv = [
      "company,title,description,url,stage,nextActionAt",
      "云帆科技,产品实习生,,https://jobs.example.com/ok,new,",
      "",
      "职位公司,安全工程师,负责安全,ftp://jobs.example.com/bad,applied,",
      "凭据公司,后端工程师,负责服务,https://user:pass@jobs.example.com/secret,communicating,",
      "阶段公司,设计师,负责设计,https://jobs.example.com/design,rejected,",
      "日期公司,运营,负责运营,https://jobs.example.com/date,applied,2026-02-30T09:00",
    ].join("\r\n");

    const preview = parseOpportunityCsv(csv, { now: NOW });

    expect(preview.ignoredBlankRows).toBe(1);
    expect(preview.canImport).toBe(false);
    expect(preview.rows).toHaveLength(5);
    expect(preview.rows[0].errors.map((error) => error.field)).toContain("description");
    expect(preview.rows[1].errors.map((error) => error.field)).toContain("url");
    expect(preview.rows[2].errors.map((error) => error.field)).toContain("url");
    expect(preview.rows[3].errors.map((error) => error.field)).toContain("stage");
    expect(preview.rows[4].errors.map((error) => error.field)).toContain("nextActionAt");
  });

  it("rejects missing required headers and batches over 50 non-empty rows", () => {
    expect(parseOpportunityCsv("company,title\n云帆科技,产品实习生").globalErrors[0].message).toContain("description");

    const rows = Array.from({ length: 51 }, (_, index) => `公司${index},岗位${index},JD${index}`).join("\n");
    const preview = parseOpportunityCsv(`company,title,description\n${rows}`);
    expect(preview.canImport).toBe(false);
    expect(preview.globalErrors.some((error) => error.message.includes("50"))).toBe(true);
  });

  it("returns soft duplicate hints without removing either candidate", () => {
    const existing = opportunity({
      id: "existing",
      source: "manual",
      job: { company: "云帆科技", title: "AI 产品实习生", description: "已有岗位", location: "上海" },
      sourceUrl: "https://jobs.example.com/roles/1",
    });
    const candidate = createManualOpportunity(manualInput({ title: "AI 产品实习生", location: "上海" }), { now: NOW });

    const hints = findSimilarOpportunities(candidate, [existing]);
    expect(hints).toHaveLength(1);
    expect(hints[0].reasons).toContain("same-company-title");
    expect(candidate.id).not.toBe(existing.id);
  });
});

describe("funnel and task rules", () => {
  it("counts every stage and derives funnel summaries", () => {
    const stats = calculateFunnelStats([
      opportunity({ id: "1", stage: "new" }),
      opportunity({ id: "2", stage: "tailoring" }),
      opportunity({ id: "3", stage: "interviewing" }),
      opportunity({ id: "4", stage: "offer" }),
      opportunity({ id: "5", stage: "unsuitable" }),
      opportunity({ id: "6", stage: "closed" }),
    ]);

    expect(stats.total).toBe(6);
    expect(stats.activeCount).toBe(4);
    expect(stats.closedCount).toBe(2);
    expect(stats.interviewing).toBe(1);
    expect(stats.counts.offer).toBe(1);
  });

  it("groups open tasks by local calendar day and preserves references", () => {
    const applications = [application()];
    const opportunities = [
      opportunity({
        id: "overdue",
        applicationId: "application-a",
        nextAction: { id: "a1", kind: "follow-up", title: "逾期", dueAt: "2026-11-18T08:00:00+08:00", createdAt: NOW },
      }),
      opportunity({
        id: "today",
        applicationId: "application-a",
        nextAction: { id: "a2", kind: "follow-up", title: "今天", dueAt: "2026-11-19T23:59:00+08:00", createdAt: NOW },
      }),
      opportunity({
        id: "future",
        applicationId: "application-a",
        nextAction: { id: "a3", kind: "follow-up", title: "未来", dueAt: "2026-11-21T09:00:00+08:00", createdAt: NOW },
      }),
      opportunity({
        id: "completed",
        applicationId: "application-a",
        nextAction: { id: "a4", kind: "follow-up", title: "完成", dueAt: "2026-11-19T08:00:00+08:00", completedAt: NOW, createdAt: NOW },
      }),
      opportunity({
        id: "invalid",
        applicationId: "application-a",
        nextAction: { id: "a5", kind: "follow-up", title: "无效", dueAt: "not-a-date", createdAt: NOW },
      }),
    ];

    const groups = groupApplicationTasks(opportunities, applications, new Date("2026-11-19T12:00:00+08:00"));

    expect(groups.overdue.map((task) => task.opportunity.id)).toEqual(["overdue"]);
    expect(groups.today.map((task) => task.opportunity.id)).toEqual(["today"]);
    expect(groups.future.map((task) => task.opportunity.id)).toEqual(["future"]);
    expect(groups.future[0].daysAhead).toBe(2);
    expect(groups.future[0].application?.id).toBe("application-a");
    expect(groups.future[0].action.id).toBe("a3");
    expect(groups.next7Days).toHaveLength(1);
  });

  it("uses the approved default action mapping", () => {
    expect(getDefaultNextActionDefinition("new")).toMatchObject({ kind: "review", title: "判断岗位是否值得投递" });
    expect(getDefaultNextActionDefinition("saved")).toMatchObject({ kind: "review", title: "判断岗位是否值得投递" });
    expect(getDefaultNextActionDefinition("tailoring")?.kind).toBe("tailor-resume");
    expect(getDefaultNextActionDefinition("applied")?.kind).toBe("follow-up");
    expect(getDefaultNextActionDefinition("communicating")?.kind).toBe("follow-up");
    expect(getDefaultNextActionDefinition("interviewing")?.kind).toBe("prepare-interview");
    expect(getDefaultNextActionDefinition("offer")).toMatchObject({ kind: "compare-offer", title: "比较Offer并确认条件" });
    expect(getDefaultNextActionDefinition("unsuitable")).toBeUndefined();
    expect(getDefaultNextActionDefinition("closed")).toBeUndefined();
    expect(createDefaultNextAction("offer", "2026-11-22T10:00", new Date(NOW))?.kind).toBe("compare-offer");
    expect(createDefaultNextAction("new", "", new Date(NOW))?.dueAt).toBe(new Date(NOW).toISOString());
  });
});

describe("legacy workspace migration", () => {
  it("creates linked opportunities once when an old payload has no opportunities array", () => {
    const app = application();
    const restored = normalizeStoredState({
      version: STORAGE_VERSION,
      profile: { name: "用户", email: "", phone: "", location: "", targetRole: "", headline: "", education: "", skills: "", projects: "", experience: "", awards: "" },
      resumes: [{
        id: "resume-a",
        title: "AI 产品简历",
        source: "generated",
        template: "graduate",
        targetRole: "AI 产品实习生",
        sections: { summary: "", skills: [], education: [], projects: [], experience: [], awards: [] },
        plainText: "React TypeScript",
        unsupportedClaims: [],
        reviewed: true,
        createdAt: NOW,
        updatedAt: NOW,
      }],
      applications: [app],
    });

    expect(restored.applications.map((item) => item.id)).toEqual([app.id]);
    expect(restored.opportunities).toHaveLength(1);
    expect(restored.opportunities[0]).toMatchObject({
      id: "opportunity-legacy-application-a",
      stage: "applied",
      source: "workspace",
      applicationId: "application-a",
      resumeId: "resume-a",
      nextAction: expect.objectContaining({ dueAt: expect.not.stringMatching(/^$/) }),
    });
  });
});

describe("rule-based interview package", () => {
  it("builds a deterministic package from opportunity and authoritative application report", () => {
    const record = opportunity({ stage: "interviewing" });
    const packageValue = generateRuleBasedInterviewPackage(record, {
      application: application(),
      now: new Date(NOW),
    });

    expect(packageValue).toMatchObject({
      opportunityId: record.id,
      company: "云帆科技",
      title: "AI 产品实习生",
      generatedAt: "2026-11-19T04:00:00.000Z",
    });
    expect(packageValue.preparationChecklist.length).toBeGreaterThanOrEqual(5);
    expect(packageValue.likelyQuestions.technical.join("\n")).toContain("GraphQL");
    expect(packageValue.likelyQuestions.technical.join("\n")).toContain("埋点分析");
    expect(packageValue.questionsToAsk.length).toBeGreaterThan(0);
  });
});

describe("storage V1 compatibility", () => {
  it("writes and restores applications and opportunities as independent authorities", () => {
    const app = application();
    const opp = opportunity();
    const resume: ResumeVersion = {
      id: "resume-a",
      title: "AI 产品简历",
      source: "generated",
      template: "graduate",
      targetRole: "AI 产品实习生",
      sections: { summary: "产品与数据分析", skills: ["React"], education: [], projects: [], experience: [], awards: [] },
      plainText: "产品与数据分析 React",
      unsupportedClaims: [],
      reviewed: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const payload = createStoredPayload({ name: "用户", email: "", phone: "", location: "", targetRole: "", headline: "", education: "", skills: "", projects: "", experience: "", awards: "" }, [resume], [app], [opp]);

    expect(payload.applications).toHaveLength(1);
    expect(payload.opportunities).toHaveLength(1);

    const restored = normalizeStoredState(payload);
    expect(restored.applications[0].id).toBe("application-a");
    expect(restored.opportunities[0].id).toBe("opportunity-a");
  });

  it("loads V1 payloads without synthesizing opportunities from applications", () => {
    const restored = normalizeStoredState({
      version: STORAGE_VERSION,
      profile: {},
      resumes: [],
      applications: [],
    });

    expect(restored.opportunities).toEqual([]);
  });
});
