"use client";

import type { UIMessage } from "ai";
import type { StepDescriptor } from "./step-descriptor";
import { ResponseStep } from "./response-step";
import { SuggestionStep } from "./suggestion-step";
import { ProcessBadge } from "./process-badge";
import { ProcessDetails } from "./process-details";
import { ProcessStepsInline } from "./process-steps-inline";
import {
  type ReasoningPart,
  type SuggestionsPart,
} from "@/lib/schemas/ai-data-parts";
import { reduceTaskParts, type DataTaskPart } from "@/lib/chat/reduce-task-parts";

export function AIMessage({
  message,
  consumedSuggestionMsgIds,
  onSelectSuggestion,
}: {
  message: UIMessage;
  consumedSuggestionMsgIds?: Set<string>;
  onSelectSuggestion: (text: string) => void;
}) {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const text = parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");

  const reasoningParts: Array<{ type: "data-reasoning"; data: ReasoningPart }> = [];
  const suggestionParts: Array<{ type: "data-suggestions"; data: SuggestionsPart }> = [];
  const rawTaskParts: DataTaskPart[] = [];

  for (const p of parts) {
    if (p.type === "data-reasoning") {
      reasoningParts.push(p as { type: "data-reasoning"; data: ReasoningPart });
    } else if (p.type === "data-task") {
      rawTaskParts.push(p as DataTaskPart);
    } else if (p.type === "data-suggestions") {
      suggestionParts.push(p as { type: "data-suggestions"; data: SuggestionsPart });
    }
  }

  const taskPartsLatest: DataTaskPart[] = reduceTaskParts(rawTaskParts);

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

  const lastTaskStatus = taskPartsLatest.at(-1)?.data.status;
  const isDone =
    suggestionParts.length > 0 ||
    (text.length > 0 &&
      (lastTaskStatus === "done" ||
        lastTaskStatus === "error" ||
        taskPartsLatest.length === 0));

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
      <ProcessStepsInline
        steps={processSteps}
        reasoning={reasoningParts}
        tasks={taskPartsLatest}
        isDone={isDone}
      />
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

      {!consumedSuggestionMsgIds?.has(message.id) && suggestionParts.map((p, i) => (
        <SuggestionStep
          key={`s-${i}`}
          suggestions={p.data.suggestions}
          onSelect={onSelectSuggestion}
        />
      ))}
    </div>
  );
}
