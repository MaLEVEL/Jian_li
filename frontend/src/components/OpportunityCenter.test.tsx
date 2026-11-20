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
  onMatchJd: vi.fn(),
  onSelectResume: vi.fn(),
  onGenerateResume: vi.fn(),
  onBlacklist: vi.fn(),
  onRestoreBlacklist: vi.fn(),
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

  it("renders the source, dedup status and full opportunity operation bar", () => {
    const sourcedOpportunity: OpportunityCenterRecord = {
      ...opportunity,
      source: "boss",
      sourceJobId: "BOSS-2026-001",
      sourceKey: "source-url:12345678",
      resume: { id: "resume-a", title: "AI 产品简历", targetRole: "AI 产品实习生" },
    };
    const html = renderToStaticMarkup(<OpportunityCenter opportunities={[sourcedOpportunity]} handlers={handlers} />);

    expect(html).toContain("来源：BOSS");
    expect(html).toContain("岗位编号 BOSS-2026-001");
    expect(html).toContain("重复检查通过");
    expect(html).toContain("用 JD 匹配");
    expect(html).toContain("更换简历");
    expect(html).toContain("带入定制");
    expect(html).toContain("安排跟进");
    expect(html).toContain("拉黑公司");
  });

  it("filters a blacklisted company by default and exposes the reason plus restore action when expanded", () => {
    const blacklistedPeer: OpportunityCenterRecord = {
      ...opportunity,
      id: "opp-2",
      job: { company: "云帆科技", title: "数据产品实习生", description: "负责指标体系建设。" },
      blacklistedAt: "2026-11-20T10:00:00+08:00",
      blacklistReason: "岗位方向不匹配",
    };
    const hiddenHtml = renderToStaticMarkup(
      <OpportunityCenter opportunities={[opportunity, blacklistedPeer]} handlers={handlers} />,
    );
    expect(hiddenHtml).not.toContain(`id="opportunity-${opportunity.id}-title"`);
    expect(hiddenHtml).not.toContain(`id="opportunity-${blacklistedPeer.id}-title"`);
    expect(hiddenHtml).toContain("显示黑名单 (2)");

    const expandedHtml = renderToStaticMarkup(
      <OpportunityCenter opportunities={[opportunity, blacklistedPeer]} handlers={handlers} showBlacklistedByDefault />,
    );
    expect(expandedHtml).toContain("岗位方向不匹配");
    expect(expandedHtml).toContain("恢复机会");
    expect(expandedHtml).toContain("公司级黑名单");
  });
});
