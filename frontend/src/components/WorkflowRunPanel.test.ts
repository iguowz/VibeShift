import { mount } from "@vue/test-utils";

import WorkflowRunPanel from "./WorkflowRunPanel.vue";
import type { WorkflowRun } from "../types";

function buildRun(): WorkflowRun {
  return {
    id: "run_test",
    mode: "discover",
    status: "completed",
    workspace_path: "/tmp/vibeshift/run_test",
    started_at: "2025-01-01T00:00:00Z",
    finished_at: "2025-01-01T00:00:01Z",
    duration_ms: 1000,
    title: "测试任务",
    summary: "完成调研。",
    steps: [
      {
        id: "step_1",
        label: "检索来源",
        status: "completed",
        started_at: "2025-01-01T00:00:00Z",
        finished_at: "2025-01-01T00:00:00Z",
        duration_ms: 120,
        detail: "检索候选来源",
      },
    ],
    artifacts: [
      {
        id: "art_1",
        kind: "report",
        label: "discover-report",
        path: "/tmp/vibeshift/run_test/05-discover-report.md",
        mime_type: "text/markdown",
        size_bytes: 512,
        preview: "## 结论\n- 第一条",
        created_at: "2025-01-01T00:00:01Z",
      },
    ],
  };
}

describe("WorkflowRunPanel", () => {
  it("renders artifact preview lazily after expand", async () => {
    const wrapper = mount(WorkflowRunPanel, {
      props: {
        run: buildRun(),
      },
    });

    expect(wrapper.text()).toContain("discover-report");
    expect(wrapper.text()).not.toContain("## 结论");

    const details = wrapper.get("details.artifact-item");
    (details.element as HTMLDetailsElement).open = true;
    await details.trigger("toggle");
    expect(wrapper.text()).toContain("## 结论");
  });
});
