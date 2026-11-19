import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TodayBoard } from "./TodayBoard";

describe("TodayBoard", () => {
  it("renders a meaningful empty state", () => {
    const html = renderToStaticMarkup(<TodayBoard tasks={[]} onNavigate={vi.fn()} />);
    expect(html).toContain("今天的行动队列已清空");
    expect(html).toContain("暂无即将到来的面试");
    expect(html).toContain("还没有可用简历");
  });

  it("renders tasks, interviews, pipeline items, and resume state from props", () => {
    const html = renderToStaticMarkup(
      <TodayBoard
        greeting="把今天安排清楚。"
        tasks={[{
          id: "task-1",
          title: "跟进云帆科技",
          dueAt: "2099-01-02T09:30:00+08:00",
          kind: "follow-up",
          priority: "high",
        }]}
        interviews={[{
          id: "interview-1",
          company: "星河产品",
          title: "产品实习生",
          at: "2099-01-03T14:00:00+08:00",
          format: "video",
        }]}
        opportunities={[{
          id: "opp-1",
          company: "云帆科技",
          title: "AI 产品实习生",
          stageLabel: "沟通中",
          nextStep: "补充作品集",
        }]}
        resume={{
          id: "resume-1",
          title: "产品实习生简历",
          targetRole: "AI 产品实习生",
          updatedAt: "2099-01-01T08:00:00+08:00",
        }}
        onCompleteTask={vi.fn()}
      />,
    );
    expect(html).toContain("跟进云帆科技");
    expect(html).toContain("星河产品");
    expect(html).toContain("AI 产品实习生");
    expect(html).toContain("产品实习生简历");
  });
});
