import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AIMessage } from "./ai-message";
import type { UIMessage } from "ai";

function buildMessage(parts: UIMessage["parts"], id = "m1"): UIMessage {
  return { id, role: "assistant", parts } as UIMessage;
}

describe("AIMessage", () => {
  it("renders the response, badge, and suggestions, and collapses the inline steps once the pipeline is done", () => {
    const msg = buildMessage([
      { type: "data-reasoning", data: { summary: "พบ 3 รายการ" } },
      { type: "data-task", data: { label: "ค้นหาเอกสาร", status: "done", matchCount: 3 } },
      { type: "text", text: "Dhamma is..." },
      { type: "data-suggestions", data: { suggestions: ["q1", "q2", "q3"] } },
    ]);

    render(<AIMessage message={msg} onSelectSuggestion={() => {}} />);

    expect(screen.getByTestId("response-step")).toBeInTheDocument();
    expect(screen.getByTestId("process-badge")).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-step")).toBeInTheDocument();

    const steps = screen.getByTestId("process-steps");
    expect(steps).toBeInTheDocument();
    expect(steps.className).toMatch(/max-h-0/);
    expect(steps.className).toMatch(/opacity-0/);
  });

  it("keeps the inline process steps visible while the pipeline is still running (no suggestions, no text)", () => {
    const msg = buildMessage([
      { type: "data-reasoning", data: { summary: "กำลังคิด..." } },
      { type: "data-task", data: { id: "t1", label: "ค้นหาเอกสาร", status: "running", query: "dhamma" } },
    ]);

    render(<AIMessage message={msg} onSelectSuggestion={() => {}} />);

    const steps = screen.getByTestId("process-steps");
    expect(steps).toBeInTheDocument();
    expect(steps.className).toMatch(/max-h-\[1500px\]/);
    expect(steps.className).toMatch(/opacity-100/);

    expect(screen.getByTestId("timeline-rail")).toBeInTheDocument();
    expect(screen.getByTestId("reasoning-step")).toBeInTheDocument();
    expect(screen.getByTestId("task-step")).toBeInTheDocument();

    expect(screen.queryByTestId("response-step")).not.toBeInTheDocument();
    expect(screen.queryByTestId("suggestion-step")).not.toBeInTheDocument();
    expect(screen.getByTestId("process-badge")).toBeInTheDocument();
  });

  it("collapses the inline steps when text is present and the last task is done (no suggestions yet)", () => {
    const msg = buildMessage([
      { type: "data-reasoning", data: { summary: "พบ 2 รายการ" } },
      { type: "data-task", data: { id: "t1", label: "ค้นหาเอกสาร", status: "running", query: "dhamma" } },
      { type: "data-task", data: { id: "t1", label: "ค้นหาเอกสาร", status: "done", matchCount: 2 } },
      { type: "text", text: "answer" },
    ]);

    render(<AIMessage message={msg} onSelectSuggestion={() => {}} />);

    const steps = screen.getByTestId("process-steps");
    expect(steps).toBeInTheDocument();
    expect(steps.className).toMatch(/max-h-0/);
    expect(steps.className).toMatch(/opacity-0/);
  });

  it("does not render the inline steps container when there are no process steps", () => {
    const msg = buildMessage([
      { type: "text", text: "Hello" },
      { type: "data-suggestions", data: { suggestions: ["q1", "q2", "q3"] } },
    ]);

    render(<AIMessage message={msg} onSelectSuggestion={() => {}} />);

    expect(screen.queryByTestId("process-steps")).not.toBeInTheDocument();
    expect(screen.queryByTestId("process-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId("response-step")).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-step")).toBeInTheDocument();
  });

  it("shows a Thai summary label with the document count when tasks have matches", () => {
    const msg = buildMessage([
      { type: "data-task", data: { label: "ค้นหาเอกสาร", status: "done", matchCount: 5 } },
      { type: "text", text: "answer" },
    ]);

    render(<AIMessage message={msg} onSelectSuggestion={() => {}} />);

    expect(screen.getByTestId("process-badge").textContent).toContain("ใช้เอกสาร 5 รายการ");
  });

  it("shows a generic 'ขั้นตอนการคิด' label when there are process steps without matches", () => {
    const msg = buildMessage([
      { type: "data-reasoning", data: { summary: "reasoning" } },
      { type: "text", text: "answer" },
    ]);

    render(<AIMessage message={msg} onSelectSuggestion={() => {}} />);

    expect(screen.getByTestId("process-badge").textContent).toContain("ขั้นตอนการคิด");
  });

  it("collapses repeated data-task parts with the same id to a single rail node inside the popover", () => {
    const msg = buildMessage([
      { type: "data-reasoning", data: { summary: "พบ 3 รายการ" } },
      { type: "data-task", data: { id: "t1", label: "ค้นหาเอกสาร", status: "running", query: "dhamma" } },
      { type: "data-task", data: { id: "t1", label: "ค้นหาเอกสาร", status: "done", matchCount: 3 } },
      { type: "text", text: "Dhamma is..." },
      { type: "data-suggestions", data: { suggestions: ["q1", "q2", "q3"] } },
    ]);

    render(<AIMessage message={msg} onSelectSuggestion={() => {}} />);

    fireEvent.click(screen.getByTestId("process-badge"));

    const popover = within(screen.getByTestId("process-badge-popover"));
    const nodes = popover.getAllByTestId("timeline-node");
    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n.textContent)).toEqual(["?", "\u2699"]);
  });

  it("opens the popover and shows the process steps when the badge is clicked", () => {
    const msg = buildMessage([
      { type: "data-reasoning", data: { summary: "summary text" } },
      { type: "data-task", data: { label: "Task", status: "done" } },
      { type: "text", text: "answer text" },
      { type: "data-suggestions", data: { suggestions: ["a", "b", "c"] } },
    ]);

    render(<AIMessage message={msg} onSelectSuggestion={() => {}} />);

    expect(screen.queryByTestId("process-badge-popover")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("process-badge"));

    const popover = within(screen.getByTestId("process-badge-popover"));
    expect(screen.getByTestId("process-badge-popover")).toBeInTheDocument();
    expect(popover.getByTestId("process-details")).toBeInTheDocument();
    expect(popover.getByTestId("reasoning-step")).toBeInTheDocument();
    expect(popover.getByTestId("task-step")).toBeInTheDocument();
    expect(popover.getByTestId("timeline-rail")).toBeInTheDocument();
  });

  it("concatenates multiple text parts into a single response", () => {
    const msg = buildMessage([
      { type: "text", text: "Hello " },
      { type: "text", text: "world." },
    ]);
    render(<AIMessage message={msg} onSelectSuggestion={() => {}} />);
    expect(screen.getByTestId("response-step").textContent).toBe("Hello world.");
  });

  it("forwards onSelectSuggestion to SuggestionStep", () => {
    const onSelect = vi.fn();
    const msg = buildMessage([
      { type: "data-suggestions", data: { suggestions: ["q1", "q2", "q3"] } },
    ]);
    render(<AIMessage message={msg} onSelectSuggestion={onSelect} />);
    fireEvent.click(screen.getByText("q2"));
    expect(onSelect).toHaveBeenCalledWith("q2");
  });

  it("renders nothing meaningful for an empty message (no crash)", () => {
    const msg = buildMessage([]);
    const { container } = render(<AIMessage message={msg} onSelectSuggestion={() => {}} />);
    expect(container.querySelectorAll('[data-testid="timeline-node"]')).toHaveLength(0);
    expect(screen.queryByTestId("process-steps")).not.toBeInTheDocument();
    expect(screen.queryByTestId("process-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("response-step")).not.toBeInTheDocument();
  });
});
