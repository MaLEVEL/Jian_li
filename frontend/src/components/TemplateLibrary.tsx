import { CSSProperties, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  JOB_FRAMEWORK_CATALOG,
  RESUME_TEMPLATE_CATALOG,
  buildFrameworkOutlineMarkdown,
} from "../templateCatalog";
import type { JobFrameworkId, ResumeTemplate } from "../types";

type CopyState = "idle" | "copied" | "failed";

const sectionPreviewLabels: Record<string, string> = {
  intent: "意向",
  summary: "总结",
  skills: "技能",
  education: "教育",
  projects: "项目",
  experience: "经历",
  awards: "奖项",
};

export function TemplateLibrary({
  selectedTemplate,
  onSelectTemplate,
}: {
  selectedTemplate: ResumeTemplate;
  onSelectTemplate: (template: ResumeTemplate) => void;
}) {
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<JobFrameworkId>(JOB_FRAMEWORK_CATALOG[0].id);
  const selectedFramework = JOB_FRAMEWORK_CATALOG.find((framework) => framework.id === selectedFrameworkId) ?? JOB_FRAMEWORK_CATALOG[0];
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function copyFrameworkOutline() {
    try {
      await navigator.clipboard.writeText(buildFrameworkOutlineMarkdown(selectedFramework));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="template-library">
      <section aria-labelledby="resume-template-library-title">
        <header>
          <h2 id="resume-template-library-title">简历视觉版式</h2>
          <p>给真实的经历，选一种舒服的表达。点击版式，即可在编辑器中试用。</p>
        </header>

        <div className="template-library__grid" role="list" aria-label="固定简历模板">
          {RESUME_TEMPLATE_CATALOG.map((template) => {
            const selected = template.id === selectedTemplate;
            return (
              <button
                aria-pressed={selected}
                className="template-card"
                data-selected={selected ? "true" : "false"}
                data-template-id={template.id}
                data-layout={template.layout}
                data-accent={template.accent}
                style={{ "--resume-accent": template.accent } as CSSProperties}
                key={template.id}
                onClick={() => onSelectTemplate(template.id)}
                type="button"
              >
                <span aria-hidden="true" className="template-card__preview" data-layout={template.layout}>
                  {template.sectionOrder.map((sectionId) => (
                    <span data-section={sectionId} key={sectionId}>
                      {sectionPreviewLabels[sectionId]}
                    </span>
                  ))}
                </span>
                <span className="template-card__body">
                  <strong>{template.name}</strong>
                  <small>{template.description}</small>
                  <span className="template-card__action">{selected ? "当前版式 · 继续编辑" : "使用这个版式"} <ArrowUpRight size={16} aria-hidden="true" /></span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="job-framework-title">
        <header>
          <h2 id="job-framework-title">岗位内容框架</h2>
          <p>框架用于查看结构、占位提示、证据检查和准备问题，不会虚构履历，也不会自动覆盖经历库。</p>
        </header>

        <div className="job-framework-picker" role="list" aria-label="岗位内容框架">
          {JOB_FRAMEWORK_CATALOG.map((framework) => {
            const selected = framework.id === selectedFrameworkId;
            return (
              <button
                aria-pressed={selected}
                className="job-framework-picker__option"
                data-selected={selected ? "true" : "false"}
                data-framework-id={framework.id}
                key={framework.id}
                onClick={() => {
                  setSelectedFrameworkId(framework.id);
                  setCopyState("idle");
                }}
                type="button"
              >
                <strong>{framework.name}</strong>
              </button>
            );
          })}
        </div>

        <article className="job-framework" data-framework-id={selectedFramework.id} aria-live="polite">
          <header>
            <div>
              <h3>{selectedFramework.name}</h3>
              <p>{selectedFramework.description}</p>
            </div>
            <button className="secondary-button" onClick={() => void copyFrameworkOutline()} type="button">
              {copyState === "copied" ? "已复制提纲" : copyState === "failed" ? "复制失败，请重试" : "复制 Markdown 提纲"}
            </button>
          </header>

          {selectedFramework.outline.map((section) => (
            <details key={section.id}>
              <summary>{section.title}</summary>
              <div>
                <section>
                  <h4>待补充</h4>
                  <ul>
                    {section.placeholders.map((placeholder) => (
                      <li key={placeholder}>{placeholder}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h4>证据检查</h4>
                  <ul>
                    {section.evidenceChecks.map((check) => (
                      <li key={check}>{check}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h4>准备问题</h4>
                  <ul>
                    {section.preparationQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </section>
              </div>
            </details>
          ))}
        </article>
      </section>
    </div>
  );
}
