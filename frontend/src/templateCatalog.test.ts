import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, RESUME_TEMPLATE_OPTIONS } from "./constants";
import {
  JOB_FRAMEWORK_CATALOG,
  RESUME_TEMPLATE_CATALOG,
  buildFrameworkOutlineMarkdown,
  getJobFramework,
  getResumeTemplateDefinition,
  isResumeTemplate,
} from "./templateCatalog";
import { buildResumeDocument, getOrderedResumeSections, renderResumeHtml } from "./resumeLogic";
import { normalizeStoredState, STORAGE_VERSION } from "./storage";
import type { ResumeVersion, TabId } from "./types";

const sections = {
  summary: "Python 与 Agent 项目实践者",
  skills: ["Python", "FastAPI", "LangGraph"],
  education: ["某大学 软件工程 本科"],
  projects: ["JobFit AI：实现简历解析与 JD 匹配"],
  experience: ["后端实习：参与接口开发与测试"],
  awards: ["校级课程设计奖"],
};

function buildResume(template: ResumeVersion["template"]): ResumeVersion {
  return {
    id: `resume-${template}`,
    title: `${template} template`,
    source: "generated",
    template,
    targetRole: "Python Agent 工程师",
    sections,
    plainText: "Python FastAPI LangGraph",
    unsupportedClaims: [],
    reviewed: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("navigation contract for parent integration", () => {
  it("includes the independent templates tab", () => {
    const tabs: TabId[] = ["workspace", "agent", "templates", "profile", "builder", "optimizer", "applications"];
    expect(tabs).toContain("templates");
  });
});

describe("resume template catalog", () => {
  it("ships six unique, complete, and genuinely distinct fixed templates", () => {
    expect(RESUME_TEMPLATE_CATALOG.map((template) => template.id)).toEqual([
      "graduate",
      "internship",
      "experienced",
      "technical",
      "sidebar",
      "editorial",
    ]);
    expect(new Set(RESUME_TEMPLATE_CATALOG.map((template) => template.layout)).size).toBe(6);
    expect(new Set(RESUME_TEMPLATE_CATALOG.map((template) => template.sectionOrder)).size).toBe(6);

    RESUME_TEMPLATE_CATALOG.forEach((template) => {
      expect(template.name.trim()).not.toBe("");
      expect(template.description.trim()).not.toBe("");
      expect(template.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(template.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(template.source.kind).toBe("original");
      expect(template.source.creator.trim()).not.toBe("");
      expect(template.source.license.trim()).not.toBe("");
      expect(template.sectionOrder).toHaveLength(7);
      expect(new Set(template.sectionOrder).size).toBe(7);
      expect(getResumeTemplateDefinition(template.id)).toBe(template);
    });

    expect(RESUME_TEMPLATE_OPTIONS).toHaveLength(RESUME_TEMPLATE_CATALOG.length);
    RESUME_TEMPLATE_CATALOG.forEach((template) => {
      expect(RESUME_TEMPLATE_OPTIONS).toContainEqual({
        value: template.id,
        label: template.name,
        description: template.description,
      });
    });
  });

  it("recognizes every catalog template while rejecting unknown values", () => {
    RESUME_TEMPLATE_CATALOG.forEach((template) => {
      expect(isResumeTemplate(template.id)).toBe(true);
    });
    expect(isResumeTemplate("unknown")).toBe(false);
    expect(isResumeTemplate("")).toBe(false);
  });

  it("keeps the original three template section orders unchanged", () => {
    expect(getOrderedResumeSections(buildResume("graduate")).map((section) => section.title)).toEqual([
      "求职意向", "个人总结", "教育经历", "技能", "项目经历", "实习/工作经历", "证书/奖项",
    ]);
    expect(getOrderedResumeSections(buildResume("internship")).map((section) => section.title)).toEqual([
      "求职意向", "个人总结", "技能", "项目经历", "教育经历", "实习/工作经历", "证书/奖项",
    ]);
    expect(getOrderedResumeSections(buildResume("experienced")).map((section) => section.title)).toEqual([
      "求职意向", "个人总结", "实习/工作经历", "项目经历", "技能", "教育经历", "证书/奖项",
    ]);
  });

  it("orders the three new layouts differently without changing resume facts", () => {
    const orderedByTemplate = RESUME_TEMPLATE_CATALOG.map((template) => ({
      template,
      rendered: getOrderedResumeSections(buildResume(template.id)),
    }));

    expect(orderedByTemplate.find((item) => item.template.id === "technical")?.rendered.map((section) => section.title)).toEqual([
      "求职意向",
      "技能",
      "项目经历",
      "实习/工作经历",
      "个人总结",
      "教育经历",
      "证书/奖项",
    ]);
    expect(orderedByTemplate.find((item) => item.template.id === "sidebar")?.rendered.map((section) => section.title)).toEqual([
      "求职意向",
      "个人总结",
      "技能",
      "教育经历",
      "项目经历",
      "实习/工作经历",
      "证书/奖项",
    ]);
    expect(orderedByTemplate.find((item) => item.template.id === "editorial")?.rendered.map((section) => section.title)).toEqual([
      "求职意向",
      "个人总结",
      "项目经历",
      "实习/工作经历",
      "技能",
      "教育经历",
      "证书/奖项",
    ]);

    orderedByTemplate.forEach(({ rendered }) => {
      expect(rendered.flatMap((section) => section.items.filter(Boolean)).sort()).toEqual(
        [
          "Python Agent 工程师",
          sections.summary,
          sections.skills.join(" / "),
          ...sections.education,
          ...sections.projects,
          ...sections.experience,
          ...sections.awards,
        ].sort(),
      );
    });
  });
});

describe("stored template compatibility", () => {
  const payload = (template: string) => ({
    version: STORAGE_VERSION,
    profile: DEFAULT_PROFILE,
    resumes: [{
      id: `resume-${template}`,
      title: "兼容性检查",
      source: "generated",
      template,
      targetRole: "Python Agent 工程师",
      sections,
      plainText: "Python FastAPI LangGraph",
      unsupportedClaims: [],
      reviewed: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }],
    applications: [],
  });

  it("keeps old and newly added templates readable", () => {
    expect(normalizeStoredState(payload("graduate")).resumes[0].template).toBe("graduate");
    expect(normalizeStoredState(payload("internship")).resumes[0].template).toBe("internship");
    expect(normalizeStoredState(payload("technical")).resumes[0].template).toBe("technical");
    expect(normalizeStoredState(payload("sidebar")).resumes[0].template).toBe("sidebar");
    expect(normalizeStoredState(payload("editorial")).resumes[0].template).toBe("editorial");
  });

  it("falls back to graduate only for an unknown template", () => {
    expect(normalizeStoredState(payload("not-a-template")).resumes[0].template).toBe("graduate");
  });
});

describe("job content frameworks", () => {
  it("provides four complete frameworks without fabricating experience or metrics", () => {
    expect(JOB_FRAMEWORK_CATALOG.map((framework) => framework.id)).toEqual([
      "python-backend",
      "agent-rag",
      "fullstack",
      "data-analysis",
    ]);

    JOB_FRAMEWORK_CATALOG.forEach((framework) => {
      expect(framework.name.trim()).not.toBe("");
      expect(framework.description.trim()).not.toBe("");
      expect(framework.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(framework.outline.length).toBeGreaterThanOrEqual(4);
      framework.outline.forEach((section) => {
        expect(section.title.trim()).not.toBe("");
        expect(section.placeholders).toHaveLength(3);
        expect(section.evidenceChecks.length).toBeGreaterThanOrEqual(2);
        expect(section.preparationQuestions.length).toBeGreaterThanOrEqual(2);
        section.placeholders.forEach((placeholder) => {
          expect(placeholder).toMatch(/请填写|请选择|请描述|请列出|请说明/);
          expect(placeholder).not.toMatch(/\d+(?:\.\d+)?%|\d+\s*(?:人|次|万|k|K|ms|秒|分钟)/i);
        });
      });
    });
  });

  it("renders a framework as a copyable review-first Markdown outline", () => {
    const framework = getJobFramework("agent-rag");
    const markdown = buildFrameworkOutlineMarkdown(framework);

    expect(markdown).toContain(`# 岗位内容框架：${framework.name}`);
    expect(markdown).toContain("> 该框架只整理结构和证据，不虚构履历，也不会自动覆盖个人资料。");
    framework.outline.forEach((section) => {
      expect(markdown).toContain(`## ${section.title}`);
      expect(markdown).toContain("### 待补充");
      expect(markdown).toContain("### 证据检查");
      expect(markdown).toContain("### 准备问题");
    });
  });
});




describe("resume export layout consistency", () => {
  it("renders each template HTML with catalog accent and preserves every fact", () => {
    RESUME_TEMPLATE_CATALOG.forEach((template) => {
      const html = renderResumeHtml(DEFAULT_PROFILE, buildResume(template.id));
      const allFacts = [
        buildResume(template.id).targetRole,
        sections.summary,
        sections.skills.join(" / "),
        ...sections.education,
        ...sections.projects,
        ...sections.experience,
        ...sections.awards,
      ];

      expect(html).toContain(`data-template-id="${template.id}"`);
      expect(html).toContain(`data-layout="${template.layout}"`);
      expect(html).toContain(template.accent);
      allFacts.forEach((fact) => expect(html).toContain(fact));
    });
  });

  it("renders the sidebar template as a real two-column print layout", () => {
    const html = renderResumeHtml(DEFAULT_PROFILE, buildResume("sidebar"));

    expect(html).toContain('class="resume-layout resume-layout--two-column-sidebar"');
    expect(html).toContain("grid-template-columns: minmax(0, 0.32fr) minmax(0, 0.68fr)");
    expect(html).toContain('<aside class="resume-side" aria-label="侧栏信息">');
    expect(html).toContain('<div class="resume-main" aria-label="主要内容">');
    ["skills", "education", "awards"].forEach((sectionId) => {
      expect(html).toContain(`data-section-id="${sectionId}"`);
    });
    ["intent", "summary", "projects", "experience"].forEach((sectionId) => {
      expect(html).toContain(`data-section-id="${sectionId}"`);
    });
  });

  it("renders non-sidebar templates as accessible single-column print layouts", () => {
    RESUME_TEMPLATE_CATALOG.filter((template) => template.layout !== "two-column-sidebar").forEach((template) => {
      const html = renderResumeHtml(DEFAULT_PROFILE, buildResume(template.id));

      expect(html).toContain(`class="resume-layout resume-layout--${template.layout}"`);
      expect(html).not.toContain("resume-side");
      expect(html).not.toContain("grid-template-columns:");
      expect((html.match(/<section /g) ?? []).length).toBe(7);
    });
  });

  it("builds DOCX output with a two-column table for sidebar and one-column flow for others", async () => {
    const { Packer } = await import("docx");
    const JSZip = (await import("jszip")).default;

    async function documentXml(template: ResumeVersion["template"]) {
      const archive = await JSZip.loadAsync(await Packer.toBuffer(await buildResumeDocument(DEFAULT_PROFILE, buildResume(template))));
      const xml = await archive.file("word/document.xml")?.async("string");
      if (!xml) {
        throw new Error("DOCX word/document.xml is missing");
      }
      return xml;
    }

    const sidebarXml = await documentXml("sidebar");
    expect(sidebarXml).toContain("<w:tbl>");
    expect((sidebarXml.match(/<w:gridCol/g) ?? []).length).toBe(2);
    const tableProperties = sidebarXml.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0] ?? "";
    expect(tableProperties).not.toMatch(/w:val="single"|w:val="double"|w:val="thick"/);
    [
      buildResume("sidebar").targetRole,
      sections.summary,
      sections.skills.join(" / "),
      ...sections.education,
      ...sections.projects,
      ...sections.experience,
      ...sections.awards,
    ].forEach((fact) => expect(sidebarXml).toContain(fact));

    for (const template of RESUME_TEMPLATE_CATALOG.filter((item) => item.layout !== "two-column-sidebar")) {
      const xml = await documentXml(template.id);
      expect(xml).not.toContain("<w:tbl>");
      expect(xml).toContain(template.accent.replace("#", "").toUpperCase());
      [
        sections.summary,
        sections.skills.join(" / "),
        ...sections.education,
        ...sections.projects,
        ...sections.experience,
        ...sections.awards,
      ].forEach((fact) => expect(xml).toContain(fact));
    }
  });
});
