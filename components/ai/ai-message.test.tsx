import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AIMessage } from "./ai-message";
import type { UIMessage } from "ai";

function buildMessage(parts: UIMessage["parts"], id = "m1"): UIMessage {
  return { id, role: "assistant", parts } as UIMessage;
}

describe("AIMessage", () => {
  it("shows the response immediately and hides process steps behind a badge", () => {
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

    expect(screen.queryByTestId("timeline-rail")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reasoning-step")).not.toBeInTheDocument();
    expect(screen.queryByTestId("task-step")).not.toBeInTheDocument();
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

  it("does not render the badge when there are no process steps", () => {
    const msg = buildMessage([
      { type: "text", text: "Hello" },
      { type: "data-suggestions", data: { suggestions: ["q1", "q2", "q3"] } },
    ]);

    render(<AIMessage message={msg} onSelectSuggestion={() => {}} />);

    expect(screen.queryByTestId("process-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId("response-step")).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-step")).toBeInTheDocument();
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

    const nodes = screen.getAllByTestId("timeline-node");
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

    expect(screen.getByTestId("process-badge-popover")).toBeInTheDocument();
    expect(screen.getByTestId("process-details")).toBeInTheDocument();
    expect(screen.getByTestId("reasoning-step")).toBeInTheDocument();
    expect(screen.getByTestId("task-step")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-rail")).toBeInTheDocument();
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
    expect(screen.queryByTestId("process-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("response-step")).not.toBeInTheDocument();
  });
});
