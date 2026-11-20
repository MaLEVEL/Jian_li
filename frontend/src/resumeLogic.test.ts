import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE } from "./constants";
import {
  analyzeMatch,
  buildResumeFromPastedText,
  extractKeywords,
  extractResumeIdentityFromText,
  extractResumeTargetRoleFromText,
  getResumeIdentity,
  inheritResumeAppearance,
  inspectResumeQuality,
  optimizeResume,
  renderResumeText,
  resolveResumeAppearance,
} from "./resumeLogic";
import type { ResumeVersion } from "./types";

const baseResume: ResumeVersion = {
  id: "resume-1",
  title: "Frontend base",
  source: "generated",
  template: "graduate",
  targetRole: "Frontend Engineer",
  sections: {
    summary: "React and TypeScript frontend developer",
    skills: ["Python", "React", "TypeScript", "Vite"],
    education: ["Software Engineering"],
    projects: ["Campus marketplace with search filters", "职启云帆 dashboard built with React and Vite"],
    experience: ["Frontend intern building reusable components"],
    awards: [],
  },
  plainText: "React TypeScript Vite frontend components",
  unsupportedClaims: [],
  reviewed: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("resume logic", () => {
  it("analyzes keyword overlap between a resume and JD", () => {
    const report = analyzeMatch(
      "React TypeScript Vite frontend components",
      "We need React, TypeScript, Vite, UX, and component-driven development.",
      baseResume.sections,
    );

    expect(report.score).toBeGreaterThan(42);
    expect(report.matchedKeywords).toEqual(expect.arrayContaining(["React", "TypeScript", "Vite"]));
    expect(report.missingKeywords).toContain("UX");
    expect(report.missingKeywords).not.toEqual(expect.arrayContaining(["We", "need", "and"]));
    expect(report.skillCoverage).toBeGreaterThan(0);
    expect(report.projectCoverage).toBeGreaterThanOrEqual(0);
    expect(report.scoreBreakdown).toEqual(
      expect.arrayContaining([
        expect.stringContaining("技能关键词贡献"),
        expect.stringContaining("项目经历证明贡献"),
        expect.stringContaining("量化成果贡献"),
      ]),
    );
  });

  it("keeps keyword-only resumes from scoring as excellent", () => {
    const thinSections = {
      summary: "前端实习方向，熟悉 React TypeScript Vite。",
      skills: ["React", "TypeScript", "Vite", "CSS"],
      education: ["某大学 本科"],
      projects: ["课程项目：完成一个简单页面"],
      experience: [],
      awards: [],
    };
    const report = analyzeMatch(
      "React TypeScript Vite CSS 前端 项目 实习",
      "React TypeScript Vite CSS 前端组件开发，负责性能优化、用户体验改进、工程化协作和上线交付。",
      thinSections,
    );

    expect(report.weightedCoverage).toBeGreaterThan(70);
    expect(report.score).toBeLessThan(85);
    expect(report.scoreBreakdown).toEqual(expect.arrayContaining([expect.stringContaining("量化成果贡献 0/20")]));
  });

  it("filters stop words and keeps higher-signal JD keywords first", () => {
    const keywords = extractKeywords("We need a frontend engineer with React, TypeScript, Vite, and UX experience.");

    expect(keywords.slice(0, 5)).toEqual(expect.arrayContaining(["React", "TypeScript", "Vite", "UX"]));
    expect(keywords).not.toEqual(expect.arrayContaining(["We", "need", "and", "with"]));
  });

  it("optimizes resume sections with JD-focused ordering and highlight", () => {
    const job = {
      company: "云帆科技",
      title: "Frontend Engineer",
      description: "React TypeScript Vite components user experience",
    };
    const report = analyzeMatch(baseResume.plainText, job.description);
    const optimized = optimizeResume(DEFAULT_PROFILE, baseResume, job, report);

    expect(optimized.summary).toContain("Frontend Engineer");
    expect(optimized.projects[0]).toContain("岗位相关亮点");
    expect(optimized.projects[1]).toContain("职启云帆 dashboard");
    expect(optimized.projects[1]).toContain("匹配关键词");
    expect(optimized.skills.slice(0, 3)).toEqual(expect.arrayContaining(["React", "TypeScript", "Vite"]));
  });

  it("keeps photo appearance out of resume text, AI matching input, and optimized sections", () => {
    const photoDataUrl = "data:image/jpeg;base64,/9j/2Q==";
    const resumeWithPhoto: ResumeVersion = {
      ...baseResume,
      appearance: {
        fontFamily: "sans",
        fontSize: 12,
        lineHeight: 1.55,
        pageMargin: 16,
        pageCount: 1,
        photoDataUrl,
        photoPosition: "left",
      },
    };
    const plainText = renderResumeText(DEFAULT_PROFILE, resumeWithPhoto.sections);
    const job = { company: "云帆科技", title: "Frontend Engineer", description: "React TypeScript" };
    const report = analyzeMatch(plainText, job.description, resumeWithPhoto.sections);
    const optimized = optimizeResume(DEFAULT_PROFILE, resumeWithPhoto, job, report);

    expect(plainText).not.toContain("data:image/jpeg");
    expect(resolveResumeAppearance(resumeWithPhoto)).toMatchObject({ photoDataUrl, photoPosition: "left" });
    const inheritedAppearance = inheritResumeAppearance(resumeWithPhoto);
    expect(inheritedAppearance).toEqual(resumeWithPhoto.appearance);
    expect(inheritedAppearance).not.toBe(resumeWithPhoto.appearance);
    expect(JSON.stringify(optimized)).not.toContain("data:image/jpeg");
  });
  it("checks resume quality for quantification and one-page readability", () => {
    const report = inspectResumeQuality({
      ...baseResume,
      sections: {
        ...baseResume.sections,
        projects: ["负责前端页面开发，优化加载性能 30%，支持 2000+ 用户访问"],
        experience: ["参与后台管理系统表单组件建设"],
      },
      plainText: "负责前端页面开发，优化加载性能 30%，支持 2000+ 用户访问\n参与后台管理系统表单组件建设",
    });

    expect(report.score).toBeGreaterThan(60);
    expect(report.estimatedPages).toBe(1);
    expect(report.issues.some((issue) => issue.id === "quantified-results" && issue.level === "good")).toBe(true);
  });

  it("increases the page estimate when typography and margins reduce capacity", () => {
    const content = "参与项目并完成交付".repeat(180);
    const compact = inspectResumeQuality({ ...baseResume, plainText: content });
    const spacious = inspectResumeQuality({
      ...baseResume,
      plainText: content,
      appearance: {
        fontFamily: "serif",
        fontSize: 16,
        lineHeight: 2,
        pageMargin: 24,
        pageCount: 2,
      },
    });
    expect(spacious.estimatedPages).toBeGreaterThan(compact.estimatedPages);
  });
  it("uses the selected two-page budget when evaluating page length", () => {
    const longResume: ResumeVersion = {
      ...baseResume,
      plainText: "真实项目经历".repeat(300),
      appearance: {
        fontFamily: "sans",
        fontSize: 12,
        lineHeight: 1.5,
        pageMargin: 16,
        pageCount: 2,
      },
    };

    const report = inspectResumeQuality(longResume);
    const pageIssue = report.issues.find((issue) => issue.id === "one-page");
    expect(pageIssue?.title).toBe("适合双页简历");
    expect(pageIssue?.level).toBe("good");
  });
  it("extracts useful sections from pasted English resume text", () => {
    const sections = buildResumeFromPastedText(`Jane Doe
Email: jane@example.com
Skills: React, TypeScript, Vite, CSS
Education: Software Engineering Bachelor at Example University
Experience: Frontend Engineer Intern built reusable form components
Project: 职启云帆 platform for resume matching and application tracking
Award: Campus software competition finalist`);

    expect(sections.skills).toEqual(expect.arrayContaining(["React", "TypeScript", "Vite"]));
    expect(sections.education.join(" ")).toMatch(/University/i);
    expect(sections.experience.join(" ")).toMatch(/Intern/i);
    expect(sections.projects.join(" ")).toMatch(/职启云帆 platform/i);
    expect(sections.awards.join(" ")).toMatch(/competition/i);
  });

  it("extracts identity and target role from pasted Chinese resume text", () => {
    const text = `李同学
产品助理实习生
教育经历：某大学 信息管理 本科 2022-2026
技能：Axure, SQL, Excel, 用户调研, 数据分析, 原型设计
项目经历：校园活动小程序
实习经历：产品运营实习生`;

    const identity = extractResumeIdentityFromText(text);
    const targetRole = extractResumeTargetRoleFromText(text);
    const sections = buildResumeFromPastedText(text);
    const displayIdentity = getResumeIdentity(DEFAULT_PROFILE, { ...baseResume, identity });

    expect(identity.name).toBe("李同学");
    expect(targetRole).toBe("产品助理实习生");
    expect(displayIdentity.name).toBe("李同学");
    expect(displayIdentity.name).not.toBe(DEFAULT_PROFILE.name);
    expect(sections.summary).toBe("已导入一份已有简历文本，可继续用于 JD 匹配和版本管理。");
    expect(sections.education).toEqual(["某大学 信息管理 本科 2022-2026"]);
    expect(sections.skills).toEqual(expect.arrayContaining(["Axure", "SQL", "Excel", "用户调研", "数据分析", "原型设计"]));
    expect(sections.projects).toEqual(["校园活动小程序"]);
    expect(sections.experience).toEqual(["产品运营实习生"]);
    expect(sections.projects).not.toContain("李同学");
    expect(sections.experience).not.toContain("产品助理实习生");
  });
});
