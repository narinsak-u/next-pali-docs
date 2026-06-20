"use client";

import type { UIMessage } from "ai";
import type { StepDescriptor } from "./step-descriptor";
import { ResponseStep } from "./response-step";
import { SuggestionStep } from "./suggestion-step";
import { ProcessBadge } from "./process-badge";
import { ProcessDetails } from "./process-details";
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

  const reasoningParts: Array<{ type: "data-reasoning"; data: ReasoningPart }> = [];
  const taskPartsLatest: Array<{ type: "data-task"; data: TaskPart }> = [];
  const suggestionParts: Array<{ type: "data-suggestions"; data: SuggestionsPart }> = [];
  const seenTaskIds = new Set<string>();

  for (const p of parts) {
    if (p.type === "data-reasoning") {
      reasoningParts.push(p as { type: "data-reasoning"; data: ReasoningPart });
    } else if (p.type === "data-task") {
      const data = (p as { type: "data-task"; data: TaskPart }).data;
      if (data.id) {
        if (seenTaskIds.has(data.id)) {
          const existing = taskPartsLatest.find((t) => t.data.id === data.id);
          if (existing) {
            existing.data = { ...existing.data, status: data.status };
          }
        } else {
          seenTaskIds.add(data.id);
          taskPartsLatest.push(p as { type: "data-task"; data: TaskPart });
        }
      } else {
        taskPartsLatest.push(p as { type: "data-task"; data: TaskPart });
      }
    } else if (p.type === "data-suggestions") {
      suggestionParts.push(p as { type: "data-suggestions"; data: SuggestionsPart });
    }
  }

  const processSteps: StepDescriptor[] = [
    ...reasoningParts.map((_, i) => ({
      id: `reasoning-${i}`,
      kind: "reasoning" as const,
      status: "done" as const,
      label: "Reasoning",
    })),
    ...taskPartsLatest.map((t) => ({
      id: t.data.id ? `task-${t.data.id}` : `task-${t.data.label}`,
      kind: "task" as const,
      status: t.data.status,
      label: t.data.label,
    })),
  ];

  const totalMatches = taskPartsLatest.reduce(
    (sum, t) => sum + (t.data.matchCount ?? 0),
    0,
  );
  const hasProcess = processSteps.length > 0;
  const badgeLabel = hasProcess
    ? totalMatches > 0
      ? `ใช้เอกสาร ${totalMatches} รายการ`
      : "ขั้นตอนการคิด"
    : null;

  return (
    <div className="flex flex-col gap-2 w-full" data-testid="ai-message">
      {text && <ResponseStep text={text} isStreaming={false} />}

      {badgeLabel && (
        <ProcessBadge label={badgeLabel}>
          <ProcessDetails
            steps={processSteps}
            reasoning={reasoningParts.map((p) => p.data)}
            tasks={taskPartsLatest.map((t) => t.data)}
          />
        </ProcessBadge>
      )}

      {suggestionParts.map((p, i) => (
        <SuggestionStep
          key={`s-${i}`}
          suggestions={p.data.suggestions}
          onSelect={onSelectSuggestion}
        />
      ))}
    </div>
  );
}

export { isDataPart };
