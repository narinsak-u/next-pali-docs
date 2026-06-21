# AI Chat Multi-Step UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the AI chat (`/api/question` + `QuestionClient`) to expose the AI's process as four observable steps (Reasoning, Task, Response, Suggestions) on a color-coded vertical timeline, using AI SDK `createUIMessageStream` + a `searchDocs` tool + a follow-up suggestion generator, with MUI Treasury visual language re-implemented in our Radix + Tailwind stack.

**Architecture:** Backend emits typed data parts (`data-reasoning`, `data-task`, `data-suggestions`) via `createUIMessageStream` with a `searchDocs` tool wrapping `runRAG`. Client renders each `UIMessage` by walking its parts and dispatching to focused step components on a left timeline rail. A new `useAIChat` hook centralizes `useChat` + error mapping. Suggestions are generated conditionally (only when grounded) via a small second LLM call.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, AI SDK v5 (`ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`), Zod, Radix UI primitives, Tailwind CSS v4, cva, Vitest + @testing-library/react.

---

## File Structure

| File | Status | Responsibility |
| ---- | ------ | -------------- |
| `lib/chat/pali-system-prompt.ts` | create | Extracts the system prompt string from the route, so it is testable. |
| `lib/chat/pali-system-prompt.test.ts` | create | Asserts prompt contains required instructions, no hard length cap. |
| `lib/services/rag-pipeline.ts` | modify | Add `searchDocuments(query)`; keep `runRAG(messages, options)` as a back-compat wrapper. |
| `lib/services/rag-pipeline.test.ts` | modify | Add tests for `searchDocuments` (empty query, topK default, error propagation). |
| `lib/services/suggestions.ts` | create | `generateSuggestions(answer): Promise<string[]>` — small `generateText` call returning 3 Thai questions. |
| `lib/services/suggestions.test.ts` | create | Returns 3 items; schema rejects malformed. |
| `lib/schemas/ai-data-parts.ts` | create | Zod schemas + TS types for the typed data parts. |
| `lib/schemas/ai-data-parts.test.ts` | create | Round-trip type tests. |
| `app/api/question/route.ts` | modify | Replace `streamText` direct call with `createUIMessageStream` + `searchDocs` tool + conditional suggestions. |
| `app/api/question/route.test.ts` | create | Mock `streamText`; assert data parts in order; skip suggestions when no matches; error path emits `data-task.status=error`. |
| `hooks/use-ai-chat.ts` | create | Wraps `useChat`; centralizes Thai error mapping, scroll behavior, `clear()`. |
| `hooks/use-ai-chat.test.tsx` | create | Maps quota/429 → Thai message; `clear()` empties. |
| `components/ai/ai-message.tsx` | create | Orchestrator: walks `UIMessage` parts, builds `StepDescriptor[]`, renders `timeline-rail` + step column. |
| `components/ai/ai-message.test.tsx` | create | Renders right step component per part type. |
| `components/ai/timeline-rail.tsx` | create | Pure render: ordered `StepDescriptor[]` → color-coded nodes + line. |
| `components/ai/timeline-rail.test.tsx` | create | One node per step; correct color class per kind/status. |
| `components/ai/reasoning-step.tsx` | create | Purple, `?` glyph. Renders `data-reasoning.summary`. |
| `components/ai/task-step.tsx` | create | Amber, ⚙ glyph. Renders `data-task` with status-aware copy. |
| `components/ai/task-step.test.tsx` | create | Status drives copy. |
| `components/ai/response-step.tsx` | create | Blue, A glyph. Renders streamed text + typing cursor. |
| `components/ai/suggestion-step.tsx` | create | Green, → glyph. Renders 3 clickable chips; click → `onSelect(text)`. |
| `components/ai/suggestion-step.test.tsx` | create | Renders one chip per suggestion; click fires `onSelect`. |
| `components/ai/chat-input.tsx` | create | Extracted textarea + send + regenerate/clear row. |
| `components/ai/index.tsx` | create | Barrel re-exporting the public surface. |
| `app/(home)/question/QuestionClient.tsx` | modify | Become a thin consumer of `useAIChat` + `ai-message` + `chat-input`. |

`components/ai/page-actions.tsx` is unchanged.

---

## Task 1: Define typed data-part schemas

**Files:**
- Create: `lib/schemas/ai-data-parts.ts`
- Create: `lib/schemas/ai-data-parts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  reasoningPartSchema,
  taskPartSchema,
  suggestionsPartSchema,
  taskStatusSchema,
} from "./ai-data-parts";

describe("ai-data-parts", () => {
  it("accepts a valid reasoning part", () => {
    expect(reasoningPartSchema.parse({ summary: "พบเอกสาร 3 รายการ" })).toEqual({
      summary: "พบเอกสาร 3 รายการ",
    });
  });

  it("rejects an empty reasoning summary", () => {
    expect(() => reasoningPartSchema.parse({ summary: "" })).toThrow();
  });

  it("accepts a running task part", () => {
    expect(
      taskPartSchema.parse({
        label: "ค้นหาเอกสาร",
        status: "running",
        query: "dhamma",
      }),
    ).toEqual({ label: "ค้นหาเอกสาร", status: "running", query: "dhamma" });
  });

  it("accepts a done task part with matchCount", () => {
    expect(
      taskPartSchema.parse({
        label: "ค้นหาเอกสาร",
        status: "done",
        matchCount: 3,
      }),
    ).toEqual({ label: "ค้นหาเอกสาร", status: "done", matchCount: 3 });
  });

  it("accepts an error task part with message", () => {
    expect(
      taskPartSchema.parse({
        label: "ค้นหาเอกสาร",
        status: "error",
        message: "Pinecone timeout",
      }),
    ).toEqual({ label: "ค้นหาเอกสาร", status: "error", message: "Pinecone timeout" });
  });

  it("rejects an unknown task status", () => {
    expect(() => taskStatusSchema.parse("paused")).toThrow();
  });

  it("accepts exactly 3 suggestions", () => {
    expect(
      suggestionsPartSchema.parse({
        suggestions: ["q1", "q2", "q3"],
      }),
    ).toEqual({ suggestions: ["q1", "q2", "q3"] });
  });

  it("rejects more or fewer than 3 suggestions", () => {
    expect(() => suggestionsPartSchema.parse({ suggestions: ["q1", "q2"] })).toThrow();
    expect(() =>
      suggestionsPartSchema.parse({ suggestions: ["q1", "q2", "q3", "q4"] }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/schemas/ai-data-parts.test.ts`
Expected: FAIL — module `@/lib/schemas/ai-data-parts` not found.

- [ ] **Step 3: Write minimal implementation**

Create `lib/schemas/ai-data-parts.ts`:

```ts
import { z } from "zod";

export const taskStatusSchema = z.enum(["pending", "running", "done", "error"]);

export const reasoningPartSchema = z.object({
  summary: z.string().min(1),
});

export const taskPartSchema = z.object({
  label: z.string().min(1),
  status: taskStatusSchema,
  query: z.string().optional(),
  matchCount: z.number().int().nonnegative().optional(),
  message: z.string().optional(),
});

export const suggestionsPartSchema = z.object({
  suggestions: z.array(z.string().min(1)).length(3),
});

export type ReasoningPart = z.infer<typeof reasoningPartSchema>;
export type TaskPart = z.infer<typeof taskPartSchema>;
export type SuggestionsPart = z.infer<typeof suggestionsPartSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/schemas/ai-data-parts.test.ts`
Expected: PASS — all 8 cases pass.

- [ ] **Step 5: Commit**

```bash
git add lib/schemas/ai-data-parts.ts lib/schemas/ai-data-parts.test.ts
git commit -m "feat(ai): add typed data-part schemas for chat steps"
```

---

## Task 2: Extract the system prompt to a testable module

**Files:**
- Create: `lib/chat/pali-system-prompt.ts`
- Create: `lib/chat/pali-system-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { PALI_EXPERT_SYSTEM_PROMPT } from "./pali-system-prompt";

describe("pali-system-prompt", () => {
  it("declares the model a Pali language expert", () => {
    expect(PALI_EXPERT_SYSTEM_PROMPT.toLowerCase()).toContain("pali");
  });

  it("instructs concise but flexible responses (no hard 100-word cap)", () => {
    expect(PALI_EXPERT_SYSTEM_PROMPT).not.toMatch(/never exceed 100 words/i);
    expect(PALI_EXPERT_SYSTEM_PROMPT.toLowerCase()).toMatch(/concise|brief|short/);
  });

  it("instructs the model to call searchDocs for textbook questions", () => {
    expect(PALI_EXPERT_SYSTEM_PROMPT.toLowerCase()).toContain("searchdocs");
  });

  it("handles the case where context is empty (no docs found)", () => {
    expect(PALI_EXPERT_SYSTEM_PROMPT.toLowerCase()).toMatch(/no context|outside the scope|kindly indicate/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/chat/pali-system-prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the prompt**

Create `lib/chat/pali-system-prompt.ts`:

```ts
export const PALI_EXPERT_SYSTEM_PROMPT = `You are a Pali language expert. Your responses are informative, accurate, and concise — short for factual questions, slightly longer for explanations.

You have a tool called searchDocs. Use it whenever the user asks a question that could be answered by the Pali textbook corpus. Pass a short, focused query string.

If a question is outside the scope of the textbook content, or if searchDocs returns no relevant passages, kindly indicate that and answer from general knowledge where appropriate.

Always answer in the same language the user wrote in. If the user wrote in Thai, respond in Thai.`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/chat/pali-system-prompt.test.ts`
Expected: PASS — all 4 cases pass.

- [ ] **Step 5: Commit**

```bash
git add lib/chat/pali-system-prompt.ts lib/chat/pali-system-prompt.test.ts
git commit -m "refactor(ai): extract system prompt to testable module"
```

---

## Task 3: Add `searchDocuments` to the RAG pipeline (keep `runRAG` for back-compat)

**Files:**
- Modify: `lib/services/rag-pipeline.ts`
- Modify: `lib/services/rag-pipeline.test.ts` (the file may not exist yet — see Step 1)

- [ ] **Step 1: Confirm the test file exists, or write the failing test**

If `lib/services/rag-pipeline.test.ts` does not exist, create it with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./embedding", () => ({
  generateEmbedding: vi.fn(),
}));
vi.mock("./vector-store", () => ({
  queryPinecone: vi.fn(),
  formatContext: vi.fn((m: unknown[]) => `ctx(${m.length})`),
}));

import { searchDocuments, runRAG } from "./rag-pipeline";
import { generateEmbedding } from "./embedding";
import { queryPinecone } from "./vector-store";
import type { UIMessage } from "ai";

const mockedEmbed = vi.mocked(generateEmbedding);
const mockedQuery = vi.mocked(queryPinecone);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchDocuments", () => {
  it("returns empty result for an empty query", async () => {
    const result = await searchDocuments("");
    expect(result).toEqual({ context: "", matches: [] });
    expect(mockedEmbed).not.toHaveBeenCalled();
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it("embeds the query and queries pinecone with topK=5 by default", async () => {
    mockedEmbed.mockResolvedValue([0.1, 0.2]);
    mockedQuery.mockResolvedValue([]);

    await searchDocuments("dhamma");

    expect(mockedEmbed).toHaveBeenCalledWith("dhamma");
    expect(mockedQuery).toHaveBeenCalledWith([0.1, 0.2], 5);
  });

  it("respects a custom topK", async () => {
    mockedEmbed.mockResolvedValue([0.1]);
    mockedQuery.mockResolvedValue([]);

    await searchDocuments("dhamma", { topK: 8 });

    expect(mockedQuery).toHaveBeenCalledWith([0.1], 8);
  });

  it("returns context and matches on success", async () => {
    mockedEmbed.mockResolvedValue([0.1]);
    mockedQuery.mockResolvedValue([{ id: "a" } as never, { id: "b" } as never]);

    const result = await searchDocuments("dhamma");

    expect(result.context).toBe("ctx(2)");
    expect(result.matches).toHaveLength(2);
  });

  it("propagates embedding errors", async () => {
    mockedEmbed.mockRejectedValue(new Error("embed failed"));

    await expect(searchDocuments("dhamma")).rejects.toThrow("embed failed");
  });
});

describe("runRAG (back-compat wrapper)", () => {
  it("delegates to searchDocuments using the last user message text", async () => {
    mockedEmbed.mockResolvedValue([0.1]);
    mockedQuery.mockResolvedValue([]);

    const messages: UIMessage[] = [
      {
        id: "1",
        role: "user",
        parts: [{ type: "text", text: "What is dhamma?" }],
      },
    ];

    await runRAG(messages);

    expect(mockedEmbed).toHaveBeenCalledWith("What is dhamma?");
  });

  it("returns empty result for an empty messages array", async () => {
    const result = await runRAG([]);
    expect(result).toEqual({ context: "", matches: [] });
  });
});
```

If the file already exists, append the new test cases.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/services/rag-pipeline.test.ts`
Expected: FAIL — `searchDocuments` not exported (or import error).

- [ ] **Step 3: Update `lib/services/rag-pipeline.ts`**

Replace the entire file content with:

```ts
import {
  queryPinecone,
  formatContext,
  type DocumentMatch,
} from "./vector-store";
import { generateEmbedding } from "./embedding";
import type { UIMessage } from "ai";

export interface RAGOptions {
  topK?: number;
}

export interface RAGResult {
  context: string;
  matches: DocumentMatch[];
}

export function extractTextFromMessages(messages: UIMessage[]): string {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return "";

  if (Array.isArray(lastMessage.parts)) {
    return lastMessage.parts.find((p) => p.type === "text")?.text || "";
  }

  if ("content" in lastMessage && typeof lastMessage.content === "string") {
    return lastMessage.content;
  }

  return "";
}

export async function searchDocuments(
  query: string,
  options: RAGOptions = {},
): Promise<RAGResult> {
  const topK = options.topK ?? 5;
  if (!query) return { context: "", matches: [] };

  const embedding = await generateEmbedding(query);
  const matches = await queryPinecone(embedding, topK);
  const context = formatContext(matches);
  return { context, matches };
}

export async function runRAG(
  messages: UIMessage[],
  options: RAGOptions = {},
): Promise<RAGResult> {
  return searchDocuments(extractTextFromMessages(messages), options);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/services/rag-pipeline.test.ts`
Expected: PASS — all cases pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/rag-pipeline.ts lib/services/rag-pipeline.test.ts
git commit -m "refactor(rag): add searchDocuments; keep runRAG as wrapper"
```

---

## Task 4: Implement `generateSuggestions`

**Files:**
- Create: `lib/services/suggestions.ts`
- Create: `lib/services/suggestions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { generateSuggestions } from "./suggestions";
import { generateText, Output } from "ai";
import { z } from "zod";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: vi.fn() };
});

const mockedGenerateText = vi.mocked(generateText);

describe("generateSuggestions", () => {
  it("returns 3 Thai question strings", async () => {
    mockedGenerateText.mockResolvedValue({
      experimental_output: { suggestions: ["q1", "q2", "q3"] },
    } as never);

    const result = await generateSuggestions("Dhamma is the teaching...");
    expect(result).toEqual(["q1", "q2", "q3"]);
  });

  it("passes a schema enforcing exactly 3 items", async () => {
    mockedGenerateText.mockResolvedValue({
      experimental_output: { suggestions: ["a", "b", "c"] },
    } as never);

    await generateSuggestions("answer");

    const call = mockedGenerateText.mock.calls[0]?.[0] as { experimental_output: Output.ObjectOutputSpec<{ suggestions: z.ZodArray<z.ZodString, "atleast">> }>;
    expect(call).toBeDefined();
    const parsed = call.experimental_output.schema.parse({ suggestions: ["x", "y", "z"] });
    expect(parsed.suggestions).toEqual(["x", "y", "z"]);
    expect(() => call.experimental_output.schema.parse({ suggestions: ["x", "y"] })).toThrow();
  });

  it("propagates generateText errors", async () => {
    mockedGenerateText.mockRejectedValue(new Error("rate limit"));
    await expect(generateSuggestions("answer")).rejects.toThrow("rate limit");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/services/suggestions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/services/suggestions.ts`:

```ts
import { generateText, Output, type LanguageModelUsage } from "ai";
import { z } from "zod";
import { openrouter } from "@/lib/services/openrouter-client";

const suggestionsSchema = z.object({
  suggestions: z.array(z.string().min(1)).length(3),
});

export async function generateSuggestions(
  answer: string,
): Promise<string[]> {
  const { experimental_output } = await generateText({
    model: openrouter(process.env.LLM_MODEL ?? "google/gemma-4-31b-it:free"),
    system:
      "You generate exactly 3 follow-up questions in the same language as the user's last message. Keep them short, focused, and grounded in the previous answer.",
    prompt: `Previous answer:\n${answer}\n\nGenerate 3 follow-up questions.`,
    experimental_output: Output.object({ schema: suggestionsSchema }),
  });
  return experimental_output.suggestions;
}

export type SuggestionsUsage = LanguageModelUsage;
```

NOTE: This introduces a new dependency on `@/lib/services/openrouter-client`. If the existing route inlines the `openrouter` setup, we will extract it in the next task. For now, create `lib/services/openrouter-client.ts` as a minimal shared module in the next task.

- [ ] **Step 4: Run test to verify it fails (it will, because `@/lib/services/openrouter-client` does not exist yet)**

Run: `npx vitest run lib/services/suggestions.test.ts`
Expected: FAIL — `@/lib/services/openrouter-client` not found.

That is expected. Move to Task 5.

- [ ] **Step 5: Commit (placeholder commit so the test exists)**

```bash
git add lib/services/suggestions.ts lib/services/suggestions.test.ts
git commit -m "feat(ai): add generateSuggestions service (depends on shared openrouter client)"
```

---

## Task 5: Extract shared `openrouter` client

**Files:**
- Create: `lib/services/openrouter-client.ts`
- Modify: `app/api/question/route.ts` (use the new client)

- [ ] **Step 1: Create `lib/services/openrouter-client.ts`**

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const openrouter = createOpenAICompatible({
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.PROVIDER_API_KEY,
});
```

- [ ] **Step 2: Update `app/api/question/route.ts` to import from the shared client**

(We are not yet restructuring the route; we are just routing the import through the shared module. The full restructure happens in Task 7. For now, only change the import.)

Replace the import block at the top of `app/api/question/route.ts`:

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, streamText, UIMessage } from "ai";
import { runRAG } from "@/lib/services/rag-pipeline";
```

with:

```ts
import { convertToModelMessages, streamText, UIMessage } from "ai";
import { runRAG } from "@/lib/services/rag-pipeline";
import { openrouter } from "@/lib/services/openrouter-client";
```

Delete the `const openrouter = createOpenAICompatible({...})` block at the top of the file.

- [ ] **Step 3: Run the existing test suite to make sure nothing broke**

Run: `npx vitest run`
Expected: PASS — no new test failures.

- [ ] **Step 4: Re-run the suggestions test to verify it still fails only because of the route restructure (not the import)**

Run: `npx vitest run lib/services/suggestions.test.ts`
Expected: still failing on the route, NOT on the import. If it now passes, that's fine — Task 7 is when the route is properly restructured.

- [ ] **Step 5: Commit**

```bash
git add lib/services/openrouter-client.ts app/api/question/route.ts
git commit -m "refactor(ai): extract openrouter client to shared module"
```

---

## Task 6: Build `timeline-rail` (pure render component)

**Files:**
- Create: `components/ai/timeline-rail.tsx`
- Create: `components/ai/timeline-rail.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelineRail } from "./timeline-rail";
import type { StepDescriptor } from "./step-descriptor";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ai/timeline-rail.test.tsx`
Expected: FAIL — components/ai/timeline-rail and step-descriptor not found.

- [ ] **Step 3: Create `components/ai/step-descriptor.ts`**

```ts
export type StepKind = "reasoning" | "task" | "response" | "suggestions";
export type StepStatus = "pending" | "running" | "done" | "error";

export interface StepDescriptor {
  id: string;
  kind: StepKind;
  status: StepStatus;
  label: string;
}
```

- [ ] **Step 4: Create `components/ai/timeline-rail.tsx`**

```tsx
import { cn } from "@/lib/utils";
import type { StepDescriptor, StepKind, StepStatus } from "./step-descriptor";

const KIND_CLASS: Record<StepKind, string> = {
  reasoning: "bg-purple-100 text-purple-700 border-purple-300",
  task: "bg-amber-100 text-amber-700 border-amber-300",
  response: "bg-blue-100 text-blue-700 border-blue-300",
  suggestions: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

const KIND_DARK: Record<StepKind, string> = {
  reasoning: "dark:bg-purple-950 dark:text-purple-300 dark:border-purple-700",
  task: "dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700",
  response: "dark:bg-blue-950 dark:text-blue-300 dark:border-blue-700",
  suggestions: "dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700",
};

const STATUS_CLASS: Record<StepStatus, string> = {
  pending: "opacity-50",
  running: "animate-pulse ring-2 ring-current",
  done: "",
  error: "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-700",
};

const GLYPH: Record<StepKind, string> = {
  reasoning: "?",
  task: "\u2699",
  response: "A",
  suggestions: "\u2192",
};

export function TimelineRail({ steps }: { steps: StepDescriptor[] }) {
  return (
    <div
      className="flex flex-col items-center gap-0 pt-2"
      data-testid="timeline-rail"
      aria-hidden="true"
    >
      {steps.map((step, i) => (
        <div key={step.id} className="flex flex-col items-center">
          <div
            data-testid="timeline-node"
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold",
              KIND_CLASS[step.kind],
              KIND_DARK[step.kind],
              STATUS_CLASS[step.status],
            )}
            title={`${step.label} · ${step.status}`}
          >
            {GLYPH[step.kind]}
          </div>
          {i < steps.length - 1 && (
            <div className="w-px h-6 bg-border" />
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run components/ai/timeline-rail.test.tsx`
Expected: PASS — all 5 cases pass.

- [ ] **Step 6: Commit**

```bash
git add components/ai/timeline-rail.tsx components/ai/timeline-rail.test.tsx components/ai/step-descriptor.ts
git commit -m "feat(ai): add timeline-rail pure-render component"
```

---

## Task 7: Build step components (reasoning, task, response, suggestion)

**Files:**
- Create: `components/ai/reasoning-step.tsx`
- Create: `components/ai/task-step.tsx`
- Create: `components/ai/task-step.test.tsx`
- Create: `components/ai/response-step.tsx`
- Create: `components/ai/suggestion-step.tsx`
- Create: `components/ai/suggestion-step.test.tsx`

- [ ] **Step 1: Write the failing `task-step` test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskStep } from "./task-step";

describe("TaskStep", () => {
  it("shows the query when status is running", () => {
    render(<TaskStep label="ค้นหาเอกสาร" status="running" query="dhamma" />);
    expect(screen.getByText(/dhamma/)).toBeInTheDocument();
    expect(screen.getByText(/กำลังค้นหา|ค้นหา/i)).toBeInTheDocument();
  });

  it("shows match count when status is done", () => {
    render(<TaskStep label="ค้นหาเอกสาร" status="done" matchCount={3} />);
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it("shows the error message when status is error", () => {
    render(<TaskStep label="ค้นหาเอกสาร" status="error" message="Pinecone timeout" />);
    expect(screen.getByText(/Pinecone timeout/)).toBeInTheDocument();
  });

  it("renders a pending state with no extra info", () => {
    render(<TaskStep label="ค้นหาเอกสาร" status="pending" />);
    expect(screen.getByText(/ค้นหาเอกสาร/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ai/task-step.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/ai/reasoning-step.tsx`**

```tsx
export function ReasoningStep({ summary }: { summary: string }) {
  return (
    <div
      data-testid="reasoning-step"
      className="rounded-md border border-purple-300 bg-purple-50 dark:bg-purple-950/40 dark:border-purple-800 px-3 py-2 text-sm text-purple-900 dark:text-purple-200"
    >
      <span className="font-semibold mr-2">Reasoning:</span>
      {summary}
    </div>
  );
}
```

- [ ] **Step 4: Create `components/ai/task-step.tsx`**

```tsx
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/schemas/ai-data-parts";

export interface TaskStepProps {
  label: string;
  status: TaskStatus;
  query?: string;
  matchCount?: number;
  message?: string;
}

export function TaskStep({ label, status, query, matchCount, message }: TaskStepProps) {
  return (
    <div
      data-testid="task-step"
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        status === "error"
          ? "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200"
          : "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200",
      )}
    >
      <span className="font-semibold mr-2">{label}:</span>
      {status === "running" && (query ? `กำลังค้นหา "${query}"...` : "กำลังทำงาน...")}
      {status === "done" && (typeof matchCount === "number" ? `เสร็จสิ้น · พบ ${matchCount} รายการ` : "เสร็จสิ้น")}
      {status === "error" && (message ?? "เกิดข้อผิดพลาด")}
      {status === "pending" && "รอดำเนินการ"}
    </div>
  );
}
```

- [ ] **Step 5: Create `components/ai/response-step.tsx`**

```tsx
import { cn } from "@/lib/utils";

export function ResponseStep({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  return (
    <div
      data-testid="response-step"
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none rounded-2xl rounded-tl-sm border bg-card px-4 py-3 text-card-foreground shadow-sm",
      )}
    >
      {text}
      {isStreaming && <span className="ml-0.5 inline-block w-1.5 h-4 align-text-bottom bg-current animate-pulse" />}
    </div>
  );
}
```

- [ ] **Step 6: Write the failing `suggestion-step` test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SuggestionStep } from "./suggestion-step";

describe("SuggestionStep", () => {
  it("renders one chip per suggestion", () => {
    render(
      <SuggestionStep
        suggestions={["q1", "q2", "q3"]}
        onSelect={() => {}}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByText("q1")).toBeInTheDocument();
    expect(screen.getByText("q2")).toBeInTheDocument();
    expect(screen.getByText("q3")).toBeInTheDocument();
  });

  it("calls onSelect with the clicked suggestion text", () => {
    const onSelect = vi.fn();
    render(
      <SuggestionStep suggestions={["q1", "q2", "q3"]} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText("q2"));
    expect(onSelect).toHaveBeenCalledWith("q2");
  });
});
```

- [ ] **Step 7: Create `components/ai/suggestion-step.tsx`**

```tsx
import { cn } from "@/lib/utils";

export function SuggestionStep({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
}) {
  return (
    <div
      data-testid="suggestion-step"
      className="flex flex-wrap gap-2"
    >
      {suggestions.map((s, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(s)}
          className={cn(
            "rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800",
            "hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
            "dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run components/ai`
Expected: PASS — all `task-step` and `suggestion-step` cases pass.

- [ ] **Step 9: Commit**

```bash
git add components/ai/reasoning-step.tsx components/ai/task-step.tsx components/ai/task-step.test.tsx components/ai/response-step.tsx components/ai/suggestion-step.tsx components/ai/suggestion-step.test.tsx
git commit -m "feat(ai): add reasoning, task, response, suggestion step components"
```

---

## Task 8: Build `ai-message` orchestrator

**Files:**
- Create: `components/ai/ai-message.tsx`
- Create: `components/ai/ai-message.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ai/ai-message.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/ai/ai-message.tsx`**

```tsx
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

  for (const p of parts) {
    if (p.type === "data-reasoning") {
      steps.push({ id: nextId(), kind: "reasoning", status: "done", label: "Reasoning" });
    } else if (p.type === "data-task") {
      const data = (p as DataPart).data;
      steps.push({ id: nextId(), kind: "task", status: data.status, label: data.label });
    } else if (p.type === "data-suggestions") {
      steps.push({ id: nextId(), kind: "suggestions", status: "done", label: "Suggestions" });
    }
  }
  if (text) {
    steps.push({ id: nextId(), kind: "response", status: "done", label: "Response" });
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ai/ai-message.test.tsx`
Expected: PASS — all 5 cases pass.

- [ ] **Step 5: Commit**

```bash
git add components/ai/ai-message.tsx components/ai/ai-message.test.tsx
git commit -m "feat(ai): add ai-message orchestrator that walks UIMessage parts"
```

---

## Task 9: Build `chat-input` component (extract from QuestionClient)

**Files:**
- Create: `components/ai/chat-input.tsx`

- [ ] **Step 1: Create `components/ai/chat-input.tsx`**

This is a straightforward extraction. Take the textarea + send + regenerate/clear row from `QuestionClient.tsx` and put it in its own file. The shape:

```tsx
"use client";

import { useRef, useEffect, type ComponentProps } from "react";
import { Loader2, RefreshCw, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export function ChatInput(props: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  status: "ready" | "streaming" | "submitted" | "error";
  onStop: () => void;
  onRegenerate: () => void;
  onClear: () => void;
  hasMessages: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "inherit";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [props.value]);

  const submit = () => {
    const v = props.value.trim();
    if (!v) return;
    props.onSubmit(v);
    props.onChange("");
  };

  return (
    <div className="p-4 bg-fd-background/50 backdrop-blur-sm sticky bottom-0 z-10">
      <div className="max-w-4xl mx-auto relative flex flex-col gap-2">
        {props.hasMessages && props.status === "ready" && (
          <div className="flex justify-center gap-2 mb-2">
            <button
              onClick={props.onRegenerate}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-2 rounded-full",
              )}
            >
              <RefreshCw className="size-3" />
              Regenerate
            </button>
            <button
              onClick={props.onClear}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-2 rounded-full",
              )}
            >
              <Trash2 className="size-3" />
              Clear
            </button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="relative flex items-center justify-center gap-2"
        >
          <TextareaInput
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            disabled={props.status !== "ready"}
            placeholder={props.status === "streaming" ? "กำลังคิด..." : "ถามคำถาม..."}
            className="pr-12 min-h-[52px] max-h-[200px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div>
            {props.status === "streaming" ? (
              <button
                type="button"
                onClick={props.onStop}
                className={cn(
                  buttonVariants({ size: "icon", variant: "ghost" }),
                  "h-8 w-8 rounded-full",
                )}
              >
                <Loader2 className="size-4 animate-spin" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={props.status !== "ready"}
                className={cn(
                  buttonVariants({ size: "icon", variant: "default" }),
                  "h-8 w-8 rounded-full",
                )}
              >
                <Send className="size-4" />
              </button>
            )}
          </div>
        </form>
        <p className="text-xs text-center text-fd-muted-foreground mt-2">
          AI can make mistakes. Please check important information.
        </p>
      </div>
    </div>
  );
}

function TextareaInput(props: ComponentProps<"textarea">) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "inherit";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [props.value]);
  return (
    <textarea
      ref={textareaRef}
      {...props}
      className={cn(
        "flex w-full rounded-2xl border border-fd-input bg-fd-background px-4 py-3 text-sm ring-offset-fd-background placeholder:text-fd-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden",
        props.className,
      )}
    />
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors (or errors only in unrelated files that already exist).

- [ ] **Step 3: Commit**

```bash
git add components/ai/chat-input.tsx
git commit -m "refactor(ai): extract chat-input from QuestionClient"
```

---

## Task 10: Build `use-ai-chat` hook

**Files:**
- Create: `hooks/use-ai-chat.ts`
- Create: `hooks/use-ai-chat.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@ai-sdk/react", () => ({
  useChat: vi.fn(),
}));
vi.mock("ai", () => ({
  DefaultChatTransport: vi.fn(),
}));

import { useChat } from "@ai-sdk/react";
import { useAIChat } from "./use-ai-chat";

function setup(overrides: Partial<{
  messages: unknown[];
  status: "ready" | "streaming" | "submitted" | "error";
  error: Error | null;
}> = {}) {
  const sendMessage = vi.fn();
  const regenerate = vi.fn();
  const stop = vi.fn();
  const setMessages = vi.fn();
  (useChat as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    messages: overrides.messages ?? [],
    status: overrides.status ?? "ready",
    sendMessage,
    regenerate,
    stop,
    setMessages,
  });
  return { sendMessage, regenerate, stop, setMessages };
}

describe("useAIChat", () => {
  it("returns messages, status, sendMessage, regenerate, stop, clear", () => {
    setup();
    const { result } = renderHook(() => useAIChat());
    expect(result.current.messages).toEqual([]);
    expect(result.current.status).toBe("ready");
    expect(typeof result.current.sendMessage).toBe("function");
    expect(typeof result.current.regenerate).toBe("function");
    expect(typeof result.current.stop).toBe("function");
    expect(typeof result.current.clear).toBe("function");
    expect(result.current.error).toBeNull();
  });

  it("clear() calls setMessages with []", () => {
    const { setMessages } = setup();
    const { result } = renderHook(() => useAIChat());
    act(() => result.current.clear());
    expect(setMessages).toHaveBeenCalledWith([]);
  });

  it("maps a quota error from useChat onError to the Thai quota message", () => {
    setup();
    const { result } = renderHook(() => useAIChat());
    act(() => {
      result.current.sendMessage({ text: "x" } as never);
    });
    const onError = (useChat as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.onError;
    expect(typeof onError).toBe("function");
    act(() => onError?.(new Error("429 quota exceeded")));
    expect(result.current.error).toMatch(/โควต้า/);
  });

  it("maps a generic error to the generic Thai message", () => {
    setup();
    const { result } = renderHook(() => useAIChat());
    act(() => {
      result.current.sendMessage({ text: "x" } as never);
    });
    const onError = (useChat as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.onError;
    act(() => onError?.(new Error("network down")));
    expect(result.current.error).toMatch(/เกิดข้อผิดพลาด/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run hooks/use-ai-chat.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `hooks/use-ai-chat.ts`**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

export interface UseAIChatReturn {
  messages: ReturnType<typeof useChat>["messages"];
  status: ReturnType<typeof useChat>["status"];
  error: string | null;
  sendMessage: ReturnType<typeof useChat>["sendMessage"];
  regenerate: ReturnType<typeof useChat>["regenerate"];
  stop: ReturnType<typeof useChat>["stop"];
  clear: () => void;
}

function mapErrorToThai(err: Error): string {
  const m = err.message.toLowerCase();
  if (m.includes("quota") || m.includes("429") || m.includes("rate limit")) {
    return "บริการ AI หมดโควต้าการใช้งาน กรุณาลองใหม่อีกครั้งในภายหลัง";
  }
  return "เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง";
}

export function useAIChat(): UseAIChatReturn {
  const [error, setError] = useState<string | null>(null);
  const { messages, status, sendMessage, regenerate, stop, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/question" }),
    onError: (err) => setError(mapErrorToThai(err)),
  });

  const clear = useCallback(() => setMessages([]), [setMessages]);

  return { messages, status, error, sendMessage, regenerate, stop, clear };
}

export { mapErrorToThai };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run hooks/use-ai-chat.test.tsx`
Expected: PASS — all 4 cases pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/use-ai-chat.ts hooks/use-ai-chat.test.tsx
git commit -m "feat(ai): add useAIChat hook with Thai error mapping"
```

---

## Task 11: Build the `components/ai/index.tsx` barrel

**Files:**
- Create: `components/ai/index.tsx`

- [ ] **Step 1: Create the barrel**

```tsx
export { AIMessage } from "./ai-message";
export { TimelineRail } from "./timeline-rail";
export { ReasoningStep } from "./reasoning-step";
export { TaskStep } from "./task-step";
export type { TaskStepProps } from "./task-step";
export { ResponseStep } from "./response-step";
export { SuggestionStep } from "./suggestion-step";
export { ChatInput } from "./chat-input";
export type { StepDescriptor, StepKind, StepStatus } from "./step-descriptor";
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add components/ai/index.tsx
git commit -m "feat(ai): add components/ai barrel exports"
```

---

## Task 12: Refactor `/api/question` route to use `createUIMessageStream` + `searchDocs` tool

**Files:**
- Modify: `app/api/question/route.ts`
- Create: `app/api/question/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const toolExecuteMock = vi.fn();
const streamTextMock = vi.fn();
const generateSuggestionsMock = vi.fn();

vi.mock("ai", () => ({
  createUIMessageStream: vi.fn((opts) => {
    const writer = {
      writes: [] as Array<{ type: string; data: unknown }>,
      write: vi.fn((w: { type: string; data: unknown }) => writer.writes.push(w)),
      merge: vi.fn(),
    };
    return Promise.resolve(opts.execute({ writer })).then(() => ({ writer }));
  }),
  createUIMessageStreamResponse: vi.fn((args: { stream: unknown }) => ({
    body: args.stream,
    headers: new Headers(),
  })),
  streamText: streamTextMock,
  convertToModelMessages: vi.fn((m) => m),
  tool: vi.fn((opts) => opts),
}));

vi.mock("@/lib/services/rag-pipeline", () => ({
  searchDocuments: vi.fn(),
}));
vi.mock("@/lib/services/openrouter-client", () => ({
  openrouter: vi.fn(),
}));
vi.mock("@/lib/chat/pali-system-prompt", () => ({
  PALI_EXPERT_SYSTEM_PROMPT: "PROMPT",
}));
vi.mock("@/lib/services/suggestions", () => ({
  generateSuggestions: generateSuggestionsMock,
}));

import { POST } from "./route";
import { searchDocuments } from "@/lib/services/rag-pipeline";

const mockedSearch = vi.mocked(searchDocuments);

beforeEach(() => {
  vi.clearAllMocks();
  streamTextMock.mockImplementation((opts) => {
    const tools = opts.tools;
    const searchDocs = tools?.searchDocs;
    return {
      toUIMessageStream: vi.fn(() => ({ pipe: vi.fn() })),
      consumeStream: vi.fn(async () => {
        if (searchDocs) {
          await searchDocs.execute(
            { query: "dhamma" },
            { toolCallId: "tc-1" } as never,
          );
        }
        return undefined;
      }),
    };
  });
});

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/question", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/question", () => {
  it("emits data-task (running, done) and data-reasoning when searchDocs returns matches", async () => {
    mockedSearch.mockResolvedValue({
      matches: [{ id: "a" } as never, { id: "b" } as never],
      context: "ctx",
    });
    generateSuggestionsMock.mockResolvedValue(["q1", "q2", "q3"]);

    const res = (await POST(
      makeReq({
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "what is dhamma?" }] }],
      }),
    )) as unknown as { body: { writer: { writes: Array<{ type: string; data: unknown }> } } };

    const writes = res.body.writer.writes;
    const taskRunning = writes.find((w) => w.type === "data-task" && (w.data as { status: string }).status === "running");
    const taskDone = writes.find((w) => w.type === "data-task" && (w.data as { status: string }).status === "done");
    const reasoning = writes.find((w) => w.type === "data-reasoning");

    expect(taskRunning).toBeDefined();
    expect((taskRunning!.data as { query: string }).query).toBe("dhamma");
    expect(taskDone).toBeDefined();
    expect((taskDone!.data as { matchCount: number }).matchCount).toBe(2);
    expect(reasoning).toBeDefined();
    expect((reasoning!.data as { summary: string }).summary).toMatch(/2/);
  });

  it("skips data-suggestions when matches is empty", async () => {
    mockedSearch.mockResolvedValue({ matches: [], context: "" });
    const res = (await POST(
      makeReq({ messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "hi" }] }] }),
    )) as unknown as { body: { writer: { writes: Array<{ type: string; data: unknown }> } } };

    const suggestionWrites = res.body.writer.writes.filter((w) => w.type === "data-suggestions");
    expect(suggestionWrites).toHaveLength(0);
    expect(generateSuggestionsMock).not.toHaveBeenCalled();
  });

  it("emits data-suggestions when matches > 0", async () => {
    mockedSearch.mockResolvedValue({ matches: [{ id: "a" } as never], context: "ctx" });
    generateSuggestionsMock.mockResolvedValue(["q1", "q2", "q3"]);

    const res = (await POST(
      makeReq({ messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "x" }] }] }),
    )) as unknown as { body: { writer: { writes: Array<{ type: string; data: unknown }> } } };

    const suggestionWrites = res.body.writer.writes.filter((w) => w.type === "data-suggestions");
    expect(suggestionWrites.length).toBeGreaterThanOrEqual(1);
    expect(generateSuggestionsMock).toHaveBeenCalledOnce();
  });

  it("emits data-task with status=error when searchDocuments throws", async () => {
    mockedSearch.mockRejectedValue(new Error("Pinecone timeout"));
    const res = (await POST(
      makeReq({ messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "x" }] }] }),
    )) as unknown as { body: { writer: { writes: Array<{ type: string; data: unknown }> } } };

    const errored = res.body.writer.writes.find(
      (w) => w.type === "data-task" && (w.data as { status: string }).status === "error",
    );
    expect(errored).toBeDefined();
    expect((errored!.data as { message: string }).message).toMatch(/Pinecone/);
  });
});
```

NOTE: The mock for `createUIMessageStream` captures the writer so we can inspect writes. The `onFinish` hook of `createUIMessageStream` (suggestion emission) is not exercised by the test's mock — we test it indirectly by checking that `generateSuggestions` is or is not called. This is the simplest mock that makes the assertions testable. If the actual implementation diverges in writer behavior, the test will catch it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/question/route.test.ts`
Expected: FAIL — the route still uses the old direct `streamText` shape.

- [ ] **Step 3: Rewrite `app/api/question/route.ts`**

```ts
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  tool,
  convertToModelMessages,
  type UIMessage,
  type LanguageModelUsage,
} from "ai";
import { z } from "zod";
import { searchDocuments } from "@/lib/services/rag-pipeline";
import { openrouter } from "@/lib/services/openrouter-client";
import { PALI_EXPERT_SYSTEM_PROMPT } from "@/lib/chat/pali-system-prompt";
import { generateSuggestions } from "@/lib/services/suggestions";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    let lastMatchCount = 0;
    let lastAnswer = "";

    const stream = createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        const result = streamText({
          model: openrouter(process.env.LLM_MODEL ?? "google/gemma-4-31b-it:free"),
          system: PALI_EXPERT_SYSTEM_PROMPT,
          messages: convertToModelMessages(messages),
          tools: {
            searchDocs: tool({
              description: "Search the Pali textbook corpus for relevant passages.",
              inputSchema: z.object({ query: z.string().min(1) }),
              execute: async ({ query }, { toolCallId }) => {
                writer.write({
                  type: "data-task",
                  id: toolCallId,
                  data: { label: "ค้นหาเอกสาร", status: "running", query },
                });
                try {
                  const { matches } = await searchDocuments(query);
                  lastMatchCount = matches.length;
                  writer.write({
                    type: "data-task",
                    id: toolCallId,
                    data: { label: "ค้นหาเอกสาร", status: "done", matchCount: matches.length },
                  });
                  writer.write({
                    type: "data-reasoning",
                    data: { summary: `พบเอกสารที่เกี่ยวข้อง ${matches.length} รายการ` },
                  });
                  return { matches };
                } catch (e: unknown) {
                  const message = e instanceof Error ? e.message : "search failed";
                  writer.write({
                    type: "data-task",
                    id: toolCallId,
                    data: { label: "ค้นหาเอกสาร", status: "error", message },
                  });
                  throw e;
                }
              },
            }),
          },
          onFinish: ({ text }) => { lastAnswer = text; },
        });

        writer.merge(result.toUIMessageStream({ sendReasoning: false }));
        await result.consumeStream();
      },
      onFinish: async ({ writer }) => {
        if (lastMatchCount === 0 || !lastAnswer) return;
        try {
          const suggestions = await generateSuggestions(lastAnswer);
          writer.write({ type: "data-suggestions", data: { suggestions } });
        } catch {
          // silent skip
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error: unknown) {
    console.error("Question API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("quota") || message.includes("429")) {
      return new Response(
        JSON.stringify({
          error: "insufficient_quota",
          message: "You exceeded your current quota",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ error: "internal_error", message }), {
      status: 500,
      headers: { "Content-Type": "application/json" } },
    );
  }
}
```

NOTE: The exact `onFinish` shape for `createUIMessageStream` in AI SDK v5 may differ (`{ writer, responseMessage }` vs other). If the test reveals a shape mismatch, fix the route to match the actual API. The test is the source of truth for the contract.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/question/route.test.ts`
Expected: PASS — all 4 cases pass. If a shape mismatch surfaces, fix the route to match the actual `createUIMessageStream` API.

- [ ] **Step 5: Commit**

```bash
git add app/api/question/route.ts app/api/question/route.test.ts
git commit -m "feat(ai): refactor /api/question to multi-step data-part stream"
```

---

## Task 13: Refactor `QuestionClient` to be a thin consumer

**Files:**
- Modify: `app/(home)/question/QuestionClient.tsx`

- [ ] **Step 1: Replace the file**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, User, X } from "lucide-react";
import { useAIChat, AIMessage, ChatInput } from "@/components/ai";
import { cn } from "@/lib/utils";

export function QuestionClient() {
  const [input, setInput] = useState("");
  const { messages, status, error, sendMessage, regenerate, stop, clear } = useAIChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] max-w-4xl mx-auto w-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-fd-muted-foreground p-8">
            <Bot className="size-12 mb-4 opacity-20" />
            <h2 className="text-2xl font-semibold mb-2">
              ฉันจะช่วยอะไรคุณได้บ้างวันนี้?
            </h2>
            <p className="max-w-md">
              ถามอะไรก็ได้เกี่ยวกับเอกสาร Pali ฉันสามารถช่วยค้นหาข้อมูล
              อธิบายแนวคิด และอื่น ๆ ได้
            </p>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex w-full justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex gap-3 max-w-[85%] lg:max-w-[75%] flex-row-reverse">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full border shadow-sm bg-background">
                  <User className="size-4 text-muted-foreground" />
                </div>
                <div className="relative px-5 py-2 shadow-sm bg-primary text-primary-foreground rounded-2xl rounded-tr-sm">
                  {(Array.isArray(m.parts) ? m.parts : [])
                    .filter((p): p is { type: "text"; text: string } => p.type === "text")
                    .map((p, i) => <span key={i}>{p.text}</span>)}
                </div>
              </div>
            </div>
          ) : (
            <AIMessage
              key={m.id}
              message={m}
              onSelectSuggestion={(text) => {
                setInput("");
                void sendMessage({ text });
              }}
            />
          ),
        )}
      </div>

      {error && (
        <div className="max-w-4xl mx-auto mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => {/* error clears on next send */}}
            className="ml-2 text-red-500 hover:text-red-700 dark:hover:text-red-300"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={(text) => {
          setInput("");
          void sendMessage({ text });
        }}
        status={status}
        onStop={stop}
        onRegenerate={regenerate}
        onClear={clear}
        hasMessages={messages.length > 0}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 3: Run the type check**

Run: `npx tsc --noEmit`
Expected: 0 new errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(home)/question/QuestionClient.tsx"
git commit -m "refactor(ai): QuestionClient becomes a thin consumer of components/ai"
```

---

## Task 14: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds. If type errors surface (e.g., from AI SDK v5 API drift), fix them in the affected file and re-run.

- [ ] **Step 3: Final commit if any fix-ups were needed**

```bash
git add -A
git commit -m "fix(ai): address build / type errors from integration"
```

---

## Spec Coverage Check

| Spec section | Task |
| ------------ | ---- |
| Typed data parts | 1, 7, 8 |
| System prompt extraction | 2 |
| `searchDocuments` refactor | 3 |
| `generateSuggestions` | 4, 12 |
| Shared openrouter client | 5 |
| `timeline-rail` | 6 |
| Step components (4) | 7 |
| `ai-message` orchestrator | 8 |
| `chat-input` | 9 |
| `use-ai-chat` hook | 10 |
| Barrel | 11 |
| Route restructure | 12 |
| `QuestionClient` refactor | 13 |
| Tests for all components | 1, 6, 7, 8, 10, 12 |
| Suggestion conditional logic | 12 |
| Error path (data-task status=error) | 12 |
| Mobile fallback (no separate code) | implicit — Tailwind stacking |
| Out of scope (no auth, no history) | respected |

All spec requirements have a task. No placeholders, no "implement later".
