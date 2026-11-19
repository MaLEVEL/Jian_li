import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InterviewPackage } from "./InterviewPackage";

describe("InterviewPackage", () => {
  it("renders an actionable empty state without a selected opportunity", () => {
    const html = renderToStaticMarkup(<InterviewPackage job={null} onNavigate={vi.fn()} />);
    expect(html).toContain("先选择一个进入面试阶段的机会");
    expect(html).toContain("去机会列表");
  });

  it("renders rule-based preparation content and the empty questions fallback", () => {
    const html = renderToStaticMarkup(
      <InterviewPackage
        job={{ company: "星河产品", title: "产品实习生" }}
        resume={{ id: "resume-1", title: "产品简历", targetRole: "产品实习生", plainText: "真实项目经历" }}
        rules={[{
          id: "rule-1",
          title: "先讲最接近岗位的证据",
          summary: "用真实项目覆盖岗位核心要求。",
          basis: "resume",
          evidence: ["用户研究项目"],
        }]}
        questions={{ technical: ["如何拆解需求？"] }}
        checklist={[{ id: "check-1", title: "复述项目指标", completed: false }]}
      />,
    );
    expect(html).toContain("岗位面试包");
    expect(html).toContain("先讲最接近岗位的证据");
    expect(html).toContain("如何拆解需求");
    expect(html).toContain("复述项目指标");
    expect(html).toContain("规则组装");
  });
});
