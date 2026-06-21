import type { UIMessage } from "ai";
import {
  type ReasoningPart,
  type TaskPart,
  type SuggestionsPart,
  type QuestionPart,
} from "@/lib/schemas/ai-data-parts";

type DataPart =
  | { type: "data-reasoning"; data: ReasoningPart }
  | { type: "data-task"; data: TaskPart }
  | { type: "data-suggestions"; data: SuggestionsPart }
  | { type: "data-question"; data: QuestionPart };

function isDataPart(p: UIMessage["parts"][number]): p is DataPart {
  return (
    p.type === "data-reasoning" ||
    p.type === "data-task" ||
    p.type === "data-suggestions" ||
    p.type === "data-question"
  );
}

export { isDataPart };
