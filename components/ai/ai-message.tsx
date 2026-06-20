"use client";

import type { UIMessage } from "ai";
import { TimelineRail } from "./timeline-rail";
import type { StepDescriptor } from "./step-descriptor";
import { ReasoningStep } from "./reasoning-step";
import { TaskStep } from "./task-step";
import { ResponseStep } from "./response-step";
import { SuggestionStep } from "./suggestion-step";
import {
  type ReasoningPart,
  type TaskPart,
  type SuggestionsPart,
} from "@/lib/schemas/ai-data-parts";

type DataPart =
  | { type: "data-reasoning"; data: ReasoningPart }
  | { type: "data-task"; data: TaskPart }
  | { type: "data-suggestions"; data: SuggestionsPart };

function isDataPart(p: UIMessage["parts"][number]): p is DataPart {
  return (
    p.type === "data-reasoning" ||
    p.type === "data-task" ||
    p.type === "data-suggestions"
  );
}

export function AIMessage({
  message,
  onSelectSuggestion,
}: {
  message: UIMessage;
  onSelectSuggestion: (text: string) => void;
}) {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const text = parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");

  const steps: StepDescriptor[] = [];
  let stepCounter = 0;
  const nextId = () => `step-${++stepCounter}`;

  const seenTaskIds = new Set<string>();

  for (const p of parts) {
    if (p.type === "data-reasoning") {
      steps.push({ id: nextId(), kind: "reasoning", status: "done", label: "Reasoning" });
    } else if (p.type === "data-task") {
      const data = (p as { type: "data-task"; data: TaskPart }).data;
      if (data.id) {
        if (seenTaskIds.has(data.id)) {
          const existing = steps.find(
            (s) => s.kind === "task" && s.id === `task-${data.id}`,
          );
          if (existing) {
            existing.status = data.status;
          }
          continue;
        }
        seenTaskIds.add(data.id);
        steps.push({
          id: `task-${data.id}`,
          kind: "task",
          status: data.status,
          label: data.label,
        });
      } else {
        steps.push({
          id: nextId(),
          kind: "task",
          status: data.status,
          label: data.label,
        });
      }
    } else if (p.type === "data-suggestions") {
      steps.push({ id: nextId(), kind: "suggestions", status: "done", label: "Suggestions" });
    }
  }

  if (text) {
    const firstSuggestionIdx = steps.findIndex((s) => s.kind === "suggestions");
    const insertAt = firstSuggestionIdx === -1 ? steps.length : firstSuggestionIdx;
    steps.splice(insertAt, 0, {
      id: nextId(),
      kind: "response",
      status: "done",
      label: "Response",
    });
  }

  const reasoningParts = parts.filter((p) => p.type === "data-reasoning") as Array<{
    type: "data-reasoning";
    data: ReasoningPart;
  }>;
  const taskParts = parts.filter((p) => p.type === "data-task") as Array<{
    type: "data-task";
    data: TaskPart;
  }>;
  const suggestionParts = parts.filter((p) => p.type === "data-suggestions") as Array<{
    type: "data-suggestions";
    data: SuggestionsPart;
  }>;

  return (
    <div className="flex gap-3 w-full justify-start" data-testid="ai-message">
      <TimelineRail steps={steps} />
      <div className="flex flex-col gap-2 max-w-[85%] lg:max-w-[75%]">
        {reasoningParts.map((p, i) => (
          <ReasoningStep key={`r-${i}`} summary={p.data.summary} />
        ))}
        {taskParts.map((p, i) => (
          <TaskStep
            key={`t-${i}`}
            label={p.data.label}
            status={p.data.status}
            query={p.data.query}
            matchCount={p.data.matchCount}
            message={p.data.message}
          />
        ))}
        {text && <ResponseStep text={text} isStreaming={false} />}
        {suggestionParts.map((p, i) => (
          <SuggestionStep
            key={`s-${i}`}
            suggestions={p.data.suggestions}
            onSelect={onSelectSuggestion}
          />
        ))}
      </div>
    </div>
  );
}

export { isDataPart };
