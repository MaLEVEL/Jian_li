import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OpportunityCenter, type OpportunityCenterRecord, type OpportunityHandlers } from "./OpportunityCenter";

const handlers: OpportunityHandlers = {
  onAdvance: vi.fn(),
  onMarkUnsuitable: vi.fn(),
  onUndo: vi.fn(),
  onScheduleFollowUp: vi.fn(),
  onCompleteFollowUp: vi.fn(),
  onConfirmImport: vi.fn(),
};

const opportunity: OpportunityCenterRecord = {
  id: "opp-1",
  stage: "saved",
  job: {
    company: "云帆科技",
    title: "AI 产品实习生",
    description: "参与 Agent 产品设计与验证。",
  },
  source: "manual",
  channel: "手动录入",
  contact: "",
  notes: "",
  createdAt: "2099-01-01T08:00:00+08:00",
  updatedAt: "2099-01-01T08:00:00+08:00",
  nextAction: {
    id: "action-1",
    kind: "follow-up",
    title: "补充作品集链接",
    dueAt: "2099-01-02T09:30:00+08:00",
    createdAt: "2099-01-01T08:00:00+08:00",
  },
};

describe("OpportunityCenter", () => {
  it("renders import entry and empty state with no opportunities", () => {
    const html = renderToStaticMarkup(<OpportunityCenter opportunities={[]} handlers={handlers} />);
    expect(html).toContain("手动粘贴或 CSV 预览");
    expect(html).toContain("漏斗还是空的");
  });

  it("renders status progression, follow-up, and exit controls", () => {
    const html = renderToStaticMarkup(<OpportunityCenter opportunities={[opportunity]} handlers={handlers} />);
    expect(html).toContain("推进至 定制中");
    expect(html).toContain("补充作品集链接");
    expect(html).toContain("不适合");
    expect(html).toContain("撤销状态");
  });
});
