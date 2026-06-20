import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelineRail } from "@/components/ai/timeline-rail";
import type { StepDescriptor } from "@/components/ai/step-descriptor";

const steps: StepDescriptor[] = [
  { id: "1", kind: "reasoning", status: "done", label: "Reasoning" },
  { id: "2", kind: "task", status: "running", label: "Task" },
  { id: "3", kind: "response", status: "done", label: "Response" },
  { id: "4", kind: "suggestions", status: "pending", label: "Suggestions" },
];

describe("TimelineRail", () => {
  it("renders one node per step", () => {
    render(<TimelineRail steps={steps} />);
    expect(screen.getAllByTestId("timeline-node")).toHaveLength(4);
  });

  it("applies the correct color class for each kind", () => {
    render(<TimelineRail steps={steps} />);
    const nodes = screen.getAllByTestId("timeline-node");
    expect(nodes[0].className).toMatch(/purple/);
    expect(nodes[1].className).toMatch(/amber/);
    expect(nodes[2].className).toMatch(/blue/);
    expect(nodes[3].className).toMatch(/emerald/);
  });

  it("applies the running state class to a running step", () => {
    render(<TimelineRail steps={steps} />);
    const nodes = screen.getAllByTestId("timeline-node");
    expect(nodes[1].className).toMatch(/animate-pulse|running/);
  });

  it("applies the error class to an errored step", () => {
    const errored: StepDescriptor[] = [
      { id: "1", kind: "task", status: "error", label: "Task" },
    ];
    render(<TimelineRail steps={errored} />);
    const node = screen.getByTestId("timeline-node");
    expect(node.className).toMatch(/red|error/);
  });

  it("renders an empty list without throwing", () => {
    const { container } = render(<TimelineRail steps={[]} />);
    expect(container.querySelectorAll('[data-testid="timeline-node"]')).toHaveLength(0);
  });
});
