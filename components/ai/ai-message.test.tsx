import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AIMessage } from "./ai-message";
import type { UIMessage } from "ai";

function buildMessage(parts: UIMessage["parts"], id = "m1"): UIMessage {
  return { id, role: "assistant", parts } as UIMessage;
}

describe("AIMessage", () => {
  it("renders a timeline rail with one node per step", () => {
    const msg = buildMessage([
      { type: "data-reasoning", data: { summary: "พบ 3 รายการ" } },
      { type: "data-task", data: { label: "ค้นหาเอกสาร", status: "done", matchCount: 3 } },
      { type: "text", text: "Dhamma is..." },
      { type: "data-suggestions", data: { suggestions: ["q1", "q2", "q3"] } },
    ]);

    render(<AIMessage message={msg} onSelectSuggestion={() => {}} />);

    expect(screen.getAllByTestId("timeline-node")).toHaveLength(4);
  });

  it("collapses repeated data-task parts with the same id to a single rail node", () => {
    const msg = buildMessage([
      { type: "data-reasoning", data: { summary: "พบ 3 รายการ" } },
      { type: "data-task", data: { id: "t1", label: "ค้นหาเอกสาร", status: "running", query: "dhamma" } },
      { type: "data-task", data: { id: "t1", label: "ค้นหาเอกสาร", status: "done", matchCount: 3 } },
      { type: "text", text: "Dhamma is..." },
      { type: "data-suggestions", data: { suggestions: ["q1", "q2", "q3"] } },
    ]);

    render(<AIMessage message={msg} onSelectSuggestion={() => {}} />);

    const nodes = screen.getAllByTestId("timeline-node");
    expect(nodes).toHaveLength(4);
    expect(nodes.map((n) => n.textContent)).toEqual(["?", "⚙", "A", "→"]);
  });

  it("renders each step component for its part type", () => {
    const msg = buildMessage([
      { type: "data-reasoning", data: { summary: "summary text" } },
      { type: "data-task", data: { label: "Task", status: "done" } },
      { type: "text", text: "answer text" },
      { type: "data-suggestions", data: { suggestions: ["a", "b", "c"] } },
    ]);

    render(<AIMessage message={msg} onSelectSuggestion={() => {}} />);

    expect(screen.getByTestId("reasoning-step")).toBeInTheDocument();
    expect(screen.getByTestId("task-step")).toBeInTheDocument();
    expect(screen.getByTestId("response-step")).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-step")).toBeInTheDocument();
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
  });
});
