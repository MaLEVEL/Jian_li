import { CSSProperties, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  JOB_FRAMEWORK_CATALOG,
  RESUME_AUDIENCE_LABELS,
  RESUME_AUDIENCE_ORDER,
  RESUME_TEMPLATE_CATALOG,
  buildFrameworkOutlineMarkdown,
} from "../templateCatalog";
import type { JobFrameworkId, ResumeTemplate } from "../types";
import type { ResumeAudience } from "../types";

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
  const [audienceFilter, setAudienceFilter] = useState<ResumeAudience | "all">("all");
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
          <div>
            <h2 id="resume-template-library-title">16 款中文简历版式</h2>
            <p>按求职阶段选择版式。所有模板共用同一份真实经历，切换不会覆盖内容，也不会替你添加没有发生过的事实。</p>
          </div>
          <span className="template-library__count">8 类人群 · 每类 2 款</span>
        </header>

        <div className="template-audience-filter" aria-label="按求职人群筛选模板">
          <button
            aria-pressed={audienceFilter === "all"}
            className="template-audience-filter__option"
            data-selected={audienceFilter === "all" ? "true" : "false"}
            onClick={() => setAudienceFilter("all")}
            type="button"
          >
            全部
            <small>{RESUME_TEMPLATE_CATALOG.length}</small>
          </button>
          {RESUME_AUDIENCE_ORDER.map((audience) => (
            <button
              aria-pressed={audienceFilter === audience}
              className="template-audience-filter__option"
              data-selected={audienceFilter === audience ? "true" : "false"}
              key={audience}
              onClick={() => setAudienceFilter(audience)}
              type="button"
            >
              {RESUME_AUDIENCE_LABELS[audience]}
              <small>{RESUME_TEMPLATE_CATALOG.filter((template) => template.audience === audience).length}</small>
            </button>
          ))}
        </div>

        <div className="template-library__grid" aria-label="固定简历模板">
          {RESUME_TEMPLATE_CATALOG.filter((template) => audienceFilter === "all" || template.audience === audienceFilter).map((template) => {
            const selected = template.id === selectedTemplate;
            return (
              <article
                className="template-card"
                data-selected={selected ? "true" : "false"}
                data-template-id={template.id}
                data-layout={template.layout}
                data-audience={template.audience}
                data-accent={template.accent}
                style={{ "--resume-accent": template.accent } as CSSProperties}
                key={template.id}
              >
                <button
                  aria-pressed={selected}
                  className="template-card__select"
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
                    <span className="template-card__eyebrow">{RESUME_AUDIENCE_LABELS[template.audience]} · {template.source.license}</span>
                    <strong>{template.name}</strong>
                    <small>{template.description}</small>
                    <span className="template-card__action">{selected ? "当前版式 · 继续编辑" : "使用这个版式"} <ArrowUpRight size={16} aria-hidden="true" /></span>
                  </span>
                </button>
                <details className="template-card__source">
                  <summary>版式来源与改造说明</summary>
                  <p>{template.source.note}</p>
                  <a href={template.source.url} target="_blank" rel="noreferrer">
                    {template.source.creator} · {template.source.license}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                </details>
              </article>
            );
          })}
        </div>
      </section>
      <section aria-labelledby="job-framework-title">
        <header>
          <h2 id="job-framework-title">岗位内容框架</h2>
          <p>框架用于查看结构、占位提示、证据检查和准备问题，不会虚构履历，也不会自动覆盖经历库。</p>
        </header>

        <div className="job-framework-picker" aria-label="岗位内容框架">
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
