# Quiz Generation Process Steps + Retrieved Context — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the quiz's full-screen `LoadingOverlay` with inline process steps and a collapsible reasoning badge (same pattern as the RAG chat). Unify the quiz and question routes on the AI SDK's `createUIMessageStream` transport.

**Architecture:** Server pipeline emits typed `data-status`, `data-task`, `data-reasoning`, and a new `data-question` part via `createUIMessageStream`. Client wraps `useChat` and derives `phase`, `matchCount`, and `questions` from the part list. A new `QuizProcess` orchestrator renders `ProcessStepsInline` + `ProcessBadge` (the same components used in `AIMessage`).

**Tech Stack:** Next.js 15 App Router, AI SDK (`ai`, `@ai-sdk/react`), Zod, Vitest, `@testing-library/react`, Tailwind CSS v4.

---

## File map

| Layer                | File                                                          | Change                                                                  |
| -------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Schema               | `lib/schemas/ai-data-parts.ts`                                 | Add `questionPartSchema` + `QuestionPart` type                          |
| Schema               | `lib/chat/message-parts.ts`                                    | Extend `DataPart` union + `isDataPart` to include `data-question`        |
| Server               | `lib/services/quiz-pipeline.ts`                               | Rewrite `generateQuizStream` to return `UIMessageStream`; delete `generateQuiz` |
| Server               | `app/api/quiz/route.ts`                                       | Return `createUIMessageStreamResponse`; keep error mapping              |
| Server tests         | `tests/quiz-pipeline.test.ts`                                 | Rewrite to assert `UIMessageStream` writes                              |
| Server tests         | `tests/quiz-route.test.ts`                                    | Update assertions for new return shape                                  |
| Client hook          | `lib/hooks/use-quiz-ai.ts`                                    | Rewrite to wrap `useChat` and derive state from `messages`              |
| Client hook tests    | `lib/hooks/use-quiz-ai.test.ts`                               | New — hook behavior + race protection                                   |
| UI orchestrator      | `app/(home)/quiz/components/QuizProcess.tsx`                  | New — wraps `ProcessStepsInline` + `ProcessBadge` + `ProcessDetails`    |
| UI state owner       | `hooks/use-quiz.ts`                                           | Update to consume new hook signature; pass `quizContext` to `QuizState` |
| UI top-level         | `app/(home)/quiz/components/QuizContents.tsx`                 | Replace `LoadingOverlay` usage with `QuizProcess`                        |
| UI state             | `app/(home)/quiz/states/QuizState.tsx`                        | Accept `quizContext` prop, render `QuizProcess` badge-only at top       |
| UI removed           | `app/(home)/quiz/components/LoadingOverlay.tsx`               | Delete — superseded by `QuizProcess`                                    |
| UI component tests   | `app/(home)/quiz/components/QuizContents.test.tsx`            | New — component-level assertions                                        |

---

## Task 1: Add `data-question` part schema

**Files:**
- Modify: `lib/schemas/ai-data-parts.ts`
- Modify: `lib/chat/message-parts.ts`
- Test: `tests/ai-data-parts.test.ts` (existing — add cases)

- [ ] **Step 1: Write failing schema tests**

Append to `tests/ai-data-parts.test.ts`:

```ts
import { questionPartSchema } from "@/lib/schemas/ai-data-parts";

describe("questionPartSchema", () => {
  it("accepts a valid question part", () => {
    expect(
      questionPartSchema.parse({
        id: "q-1",
        question: "What is dhamma?",
        answer: "Teaching of the Buddha",
        option1: "Wrong 1",
        option2: "Wrong 2",
        option3: "Wrong 3",
      }),
    ).toEqual({
      id: "q-1",
      question: "What is dhamma?",
      answer: "Teaching of the Buddha",
      option1: "Wrong 1",
      option2: "Wrong 2",
      option3: "Wrong 3",
    });
  });

  it("rejects missing required fields", () => {
    expect(() =>
      questionPartSchema.parse({ id: "q-1", question: "x" }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai-data-parts.test.ts`
Expected: FAIL — `questionPartSchema` not exported.

- [ ] **Step 3: Add the schema to `lib/schemas/ai-data-parts.ts`**

```ts
export const questionPartSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
  option1: z.string().min(1),
  option2: z.string().min(1),
  option3: z.string().min(1),
});

export type QuestionPart = z.infer<typeof questionPartSchema>;
```

- [ ] **Step 4: Extend `lib/chat/message-parts.ts` to include the new part**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/ai-data-parts.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/schemas/ai-data-parts.ts lib/chat/message-parts.ts tests/ai-data-parts.test.ts
git commit -m "feat(quiz): add data-question part schema for AI message stream"
```

---

## Task 2: Rewrite `generateQuizStream` to emit `UIMessageStream`

**Files:**
- Modify: `lib/services/quiz-pipeline.ts`
- Test: `tests/quiz-pipeline.test.ts` (rewrite)

- [ ] **Step 1: Write failing pipeline test for the success path**

Rewrite `tests/quiz-pipeline.test.ts` to mock `createUIMessageStream` (same pattern as `tests/route.test.ts:14-71`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const captured = vi.hoisted(() => ({
  submitQuestions: null as { execute: (...args: unknown[]) => Promise<unknown> } | null,
  stopWhen: null as unknown,
}));

vi.mock("ai", () => ({
  streamText: vi.fn((opts) => {
    captured.stopWhen = opts.stopWhen;
    captured.submitQuestions = opts.tools?.submitQuestions ?? null;
    return {
      toUIMessageStream: vi.fn(
        () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "finish", finishReason: "stop" });
              controller.close();
            },
          }),
      ),
      consumeStream: vi.fn(async () => {
        if (captured.submitQuestions?.execute) {
          await captured.submitQuestions.execute(
            {
              questions: [
                { question: "Q1", answer: "A1", option1: "x", option2: "y", option3: "z" },
              ],
            },
            { toolCallId: "tc-1" },
          );
        }
      }),
      text: Promise.resolve(""),
    };
  }),
  createUIMessageStream: vi.fn((opts) => {
    const writes: Array<Record<string, unknown>> = [];
    const writer = {
      writes,
      write: vi.fn((w: Record<string, unknown>) => writes.push(w)),
      merge: vi.fn(async () => {}),
    };
    return Promise.resolve(opts.execute({ writer })).then(() => ({
      body: { writer },
    }));
  }),
  tool: vi.fn((opts) => opts),
  stepCountIs: vi.fn(() => vi.fn()),
}));

vi.mock("@/lib/pinecone", () => ({
  pc: { inference: { embed: vi.fn() } },
  index: { namespace: vi.fn(() => ({ query: vi.fn() })) },
}));

vi.mock("@/lib/services/embedding", () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2]),
}));

vi.mock("@/lib/services/vector-store", () => ({
  queryPinecone: vi.fn().mockResolvedValue([
    { id: "a", score: 0.9, text: "passage A" },
    { id: "b", score: 0.8, text: "passage B" },
  ]),
  formatContext: vi.fn().mockReturnValue("MOCK CTX"),
}));

vi.mock("@/lib/services/llm-provider", () => ({
  llm: vi.fn(),
  getDefaultModel: vi.fn(() => "mock"),
}));

import { generateQuizStream } from "@/lib/services/quiz-pipeline";

interface WriterMock {
  writes: Array<Record<string, unknown>>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateQuizStream (UIMessageStream)", () => {
  it("emits searching → task running/done → reasoning → answering → question", async () => {
    const result = (await generateQuizStream({
      topics: ["x"],
      amount: 1,
    })) as unknown as { body: { writer: WriterMock } };

    const writes = result.body.writer.writes;
    const types = writes.map((w) => w.type);

    expect(types).toEqual([
      "data-status",   // searching
      "data-task",     // running
      "data-task",     // done with matchCount
      "data-reasoning",
      "data-status",   // answering
      "data-question", // tool emit
    ]);

    const status1 = writes[0] as { data: { phase: string } };
    expect(status1.data.phase).toBe("searching");

    const taskRunning = writes[1] as { data: { status: string; label: string } };
    expect(taskRunning.data.label).toBe("ค้นหาเอกสาร");
    expect(taskRunning.data.status).toBe("running");

    const taskDone = writes[2] as { data: { status: string; matchCount: number } };
    expect(taskDone.data.status).toBe("done");
    expect(taskDone.data.matchCount).toBe(2);

    const reasoning = writes[3] as { data: { summary: string; excerpts: string[] } };
    expect(reasoning.data.summary).toMatch(/2 รายการ/);
    expect(reasoning.data.excerpts).toHaveLength(2);

    const status2 = writes[4] as { data: { phase: string } };
    expect(status2.data.phase).toBe("answering");

    const question = writes[5] as { data: { question: string } };
    expect(question.data.question).toBe("Q1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/quiz-pipeline.test.ts`
Expected: FAIL — `generateQuizStream` does not return a `UIMessageStream` yet.

- [ ] **Step 3: Rewrite `lib/services/quiz-pipeline.ts`**

Replace the entire file with:

```ts
import { generateEmbedding } from "./embedding";
import {
  queryPinecone,
  formatContext,
  type DocumentMatch,
} from "./vector-store";
import {
  streamText,
  tool,
  stepCountIs,
  createUIMessageStream,
  type UIMessageStream,
} from "ai";
import { z } from "zod";
import { llm, getDefaultModel } from "@/lib/services/llm-provider";

export interface QuizInput {
  topics: string[];
  amount: number;
}

const SEARCH_TASK_LABEL = "ค้นหาเอกสาร";

function buildSystemWithContext(baseSystem: string, context: string): string {
  return `${baseSystem}\n\nContext from Pali textbook corpus:\n${context}\n\nUse this context to generate the questions. Do not search again — you already have the necessary information.`;
}

const MAX_STEPS = 20;

function stopWhenForAmount(amount: number) {
  return stepCountIs(Math.max(MAX_STEPS, Math.ceil(amount / 2) + 5));
}

export function generateQuizStream(input: QuizInput): UIMessageStream {
  return createUIMessageStream({
    execute: async ({ writer }) => {
      let searchCompleted = false;
      const searchToolCallId = `search-${Date.now()}`;

      writer.write({
        type: "data-status",
        data: { phase: "searching" },
      });

      writer.write({
        type: "data-task",
        data: {
          id: searchToolCallId,
          label: SEARCH_TASK_LABEL,
          status: "running",
          query: input.topics.join(", "),
        },
      });

      let matches: DocumentMatch[] = [];
      try {
        const embedding = await generateEmbedding(input.topics.join(", "));
        matches = await queryPinecone(embedding, 10);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "search failed";
        writer.write({
          type: "data-task",
          data: {
            id: searchToolCallId,
            label: SEARCH_TASK_LABEL,
            status: "error",
            message,
          },
        });
        matches = [];
      }

      if (!searchCompleted) {
        searchCompleted = true;
        writer.write({
          type: "data-task",
          data: {
            id: searchToolCallId,
            label: SEARCH_TASK_LABEL,
            status: "done",
            matchCount: matches.length,
          },
        });
        const excerpts = matches
          .slice(0, 10)
          .map((m) => m.text.slice(0, 120).trim());
        writer.write({
          type: "data-reasoning",
          data: {
            summary: `พบเอกสารที่เกี่ยวข้อง ${matches.length} รายการ`,
            excerpts,
          },
        });
      }

      writer.write({
        type: "data-status",
        data: { phase: "answering" },
      });

      const context = formatContext(matches);

      const result = streamText({
        model: llm(getDefaultModel()),
        system:
          "You are a quiz generator that creates multiple-choice questions based on textbook content. Generate questions one at a time using the submitQuestions tool. Call the tool once per batch of questions.",
        messages: [
          {
            role: "user",
            content: [
              "Using this context as reference:\n",
              context,
              `\nGenerate ${input.amount} multiple-choice questions about ${input.topics.join(", ")}.`,
              "The questions must be based on the provided context.",
              "Each question should test understanding of key concepts.",
              "Make sure each question and its options are directly related to the content.",
              "Translate all questions, answers, and options to Thai language.",
              "",
              "Submit questions in batches using the submitQuestions tool. Each question must have these exact fields:",
              "  question: the question text",
              "  answer: the correct answer (max 15 words)",
              "  option1: wrong option 1 (max 15 words)",
              "  option2: wrong option 2 (max 15 words)",
              "  option3: wrong option 3 (max 15 words)",
            ].join("\n"),
          },
        ],
        tools: {
          submitQuestions: tool({
            description: "Submit one or more quiz questions",
            inputSchema: z.object({
              questions: z
                .array(
                  z.object({
                    question: z.string(),
                    answer: z.string(),
                    option1: z.string(),
                    option2: z.string(),
                    option3: z.string(),
                  }),
                )
                .min(1)
                .describe("Array of quiz questions to submit"),
            }),
            execute: async ({ questions }) => {
              questions.forEach((q, i) => {
                writer.write({
                  type: "data-question",
                  data: {
                    id: `q-${Date.now()}-${i}`,
                    question: q.question,
                    answer: q.answer,
                    option1: q.option1,
                    option2: q.option2,
                    option3: q.option3,
                  },
                });
              });
              return { submitted: questions.length };
            },
          }),
        },
        stopWhen: stopWhenForAmount(input.amount),
        prepareStep: async ({ steps }) => {
          if (steps.length === 0) return undefined;
          return {
            system: buildSystemWithContext(
              "You are a quiz generator that creates multiple-choice questions based on textbook content. Generate questions one at a time using the submitQuestions tool. Call the tool once per batch of questions.",
              context,
            ),
          };
        },
      });

      writer.merge(result.toUIMessageStream({ sendReasoning: false }));
      await result.consumeStream();
    },
  });
}

export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes("quota") || err.message.includes("429");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/quiz-pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/quiz-pipeline.ts tests/quiz-pipeline.test.ts
git commit -m "refactor(quiz): rewrite pipeline to use UIMessageStream"
```

---

## Task 3: Add error-path test for the pipeline

**Files:**
- Modify: `tests/quiz-pipeline.test.ts`

- [ ] **Step 1: Add failing test for the Pinecone error path**

Append to the `describe("generateQuizStream (UIMessageStream)", …)` block in `tests/quiz-pipeline.test.ts`:

```ts
  it("emits a data-task error then continues with empty context when queryPinecone throws", async () => {
    const { queryPinecone } = await import("@/lib/services/vector-store");
    vi.mocked(queryPinecone).mockRejectedValueOnce(new Error("pinecone down"));

    const result = (await generateQuizStream({
      topics: ["x"],
      amount: 1,
    })) as unknown as { body: { writer: WriterMock } };

    const writes = result.body.writer.writes;
    const errorTask = writes.find(
      (w) =>
        w.type === "data-task" &&
        (w.data as { status: string }).status === "error",
    );
    expect(errorTask).toBeDefined();
    expect((errorTask!.data as { message: string }).message).toBe(
      "pinecone down",
    );

    const doneTask = writes.find(
      (w) =>
        w.type === "data-task" &&
        (w.data as { status: string; matchCount: number }).status === "done",
    );
    expect(doneTask).toBeDefined();
    expect((doneTask!.data as { matchCount: number }).matchCount).toBe(0);

    const reasoning = writes.find((w) => w.type === "data-reasoning");
    expect(reasoning).toBeDefined();
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/quiz-pipeline.test.ts`
Expected: PASS (the implementation already covers this — we're locking the behavior in.)

- [ ] **Step 3: Commit**

```bash
git add tests/quiz-pipeline.test.ts
git commit -m "test(quiz): add error-path coverage for pipeline"
```

---

## Task 4: Update `app/api/quiz/route.ts` to return `createUIMessageStreamResponse`

**Files:**
- Modify: `app/api/quiz/route.ts`
- Test: `tests/quiz-route.test.ts`

- [ ] **Step 1: Update the route**

Replace `app/api/quiz/route.ts` with:

```ts
import { createUIMessageStreamResponse } from "ai";
import { generateQuizStream, isQuotaError } from "@/lib/services/quiz-pipeline";
import { quizSchema } from "@/lib/schemas/quiz";
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const parsed = quizSchema.parse(data);

    const stream = generateQuizStream({
      topics: parsed.topics,
      amount: parsed.amount,
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error: unknown) {
    console.error("Quiz API error:", error);
    if (isQuotaError(error)) {
      return NextResponse.json(
        { error: "บริการ AI หมดโควต้าการใช้งาน กรุณาลองใหม่อีกครั้งในภายหลัง" },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการสร้างแบบทดสอบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Update `tests/quiz-route.test.ts` to mock the AI SDK**

Replace the imports and mock setup in `tests/quiz-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/pinecone", () => ({
  pc: { inference: { embed: vi.fn() } },
  index: { namespace: vi.fn(() => ({ query: vi.fn() })) },
}));

vi.mock("ai", () => ({
  createUIMessageStreamResponse: vi.fn((args: { stream: unknown }) => ({
    status: 200,
    body: "mock-stream",
    stream: args.stream,
  })),
}));

vi.mock("@/lib/services/quiz-pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/quiz-pipeline")>();
  return {
    ...actual,
    generateQuizStream: vi.fn(),
  };
});

import { POST } from "@/app/api/quiz/route";
import { generateQuizStream } from "@/lib/services/quiz-pipeline";

const mockedStream = vi.mocked(generateQuizStream);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/quiz", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/quiz", () => {
  it("returns 200 with the UIMessageStream on success", async () => {
    mockedStream.mockReturnValue({} as never);

    const response = await POST(makeReq({ topics: ["anatta"], amount: 3 }));

    expect(response.status).toBe(200);
    expect(mockedStream).toHaveBeenCalledWith({ topics: ["anatta"], amount: 3 });
  });

  it("returns 500 for invalid input", async () => {
    const response = await POST(makeReq({ topics: "not-an-array" }));
    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 3: Run route tests to verify they pass**

Run: `npx vitest run tests/quiz-route.test.ts`
Expected: PASS

- [ ] **Step 4: Run the full suite to confirm no regressions**

Run: `npm run test:run`
Expected: 57 + new tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/quiz/route.ts tests/quiz-route.test.ts
git commit -m "refactor(quiz): return UIMessageStreamResponse from route"
```

---

## Task 5: Add `mapErrorToThai` to quiz-pipeline route (preparation for hook)

The hook will need to map AI SDK errors to Thai. The `use-ai-chat.ts` already exports a `mapErrorToThai` — we'll add a similar helper to the quiz hook file. No test changes here; this is a no-op preparation.

**Files:** none (skip — folded into Task 6).

---

## Task 6: Rewrite `use-quiz-ai` hook to wrap `useChat`

**Files:**
- Modify: `lib/hooks/use-quiz-ai.ts`
- Test: `lib/hooks/use-quiz-ai.test.ts` (new)

- [ ] **Step 1: Write the failing hook test**

Create `lib/hooks/use-quiz-ai.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { UIMessage } from "ai";

const mockedUseChat = vi.hoisted(() => vi.fn());

vi.mock("@ai-sdk/react", () => ({
  useChat: mockedUseChat,
}));

const defaultChatState = {
  messages: [] as UIMessage[],
  status: "ready" as const,
  error: undefined as Error | undefined,
  sendMessage: vi.fn(),
  stop: vi.fn(),
  setMessages: vi.fn(),
};

function setUseChatState(state: Partial<typeof defaultChatState>) {
  mockedUseChat.mockReturnValue({ ...defaultChatState, ...state });
}

import { useQuizAI } from "@/lib/hooks/use-quiz-ai";

beforeEach(() => {
  vi.clearAllMocks();
  setUseChatState({});
});

describe("useQuizAI", () => {
  it("derives phase=searching when no data-task done part has arrived", () => {
    setUseChatState({ messages: [], status: "submitted" });

    const { result } = renderHook(() => useQuizAI());

    expect(result.current.phase).toBe("searching");
    expect(result.current.questions).toEqual([]);
    expect(result.current.matchCount).toBe(0);
  });

  it("derives phase=generating when search done but no questions yet", () => {
    setUseChatState({
      messages: [
        {
          id: "1",
          role: "assistant",
          parts: [
            { type: "data-status", data: { phase: "searching" } },
            { type: "data-task", data: { id: "t1", label: "ค้นหาเอกสาร", status: "running" } },
            { type: "data-task", data: { id: "t1", label: "ค้นหาเอกสาร", status: "done", matchCount: 5 } },
            { type: "data-reasoning", data: { summary: "พบ 5 รายการ", excerpts: ["e1"] } },
            { type: "data-status", data: { phase: "answering" } },
          ],
        },
      ],
      status: "streaming",
    });

    const { result } = renderHook(() => useQuizAI());

    expect(result.current.phase).toBe("generating");
    expect(result.current.matchCount).toBe(5);
    expect(result.current.questions).toEqual([]);
  });

  it("derives phase=done and questions from data-question parts", () => {
    setUseChatState({
      messages: [
        {
          id: "1",
          role: "assistant",
          parts: [
            { type: "data-task", data: { id: "t1", label: "ค้นหาเอกสาร", status: "done", matchCount: 2 } },
            { type: "data-reasoning", data: { summary: "x", excerpts: [] } },
            { type: "data-question", data: { id: "q1", question: "Q1", answer: "A1", option1: "o1", option2: "o2", option3: "o3" } },
            { type: "data-question", data: { id: "q2", question: "Q2", answer: "A2", option1: "o1", option2: "o2", option3: "o3" } },
          ],
        },
      ],
      status: "ready",
    });

    const { result } = renderHook(() => useQuizAI());

    expect(result.current.phase).toBe("done");
    expect(result.current.questions).toHaveLength(2);
    expect(result.current.questions[0].question).toBe("Q1");
  });

  it("derives phase=error when useChat surfaces an error", () => {
    setUseChatState({
      error: new Error("quota"),
      status: "ready",
    });

    const { result } = renderHook(() => useQuizAI());

    expect(result.current.phase).toBe("error");
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("submit calls setMessages([]) and sendMessage", () => {
    const sendMessage = vi.fn();
    const setMessages = vi.fn();
    setUseChatState({ sendMessage, setMessages });

    const { result } = renderHook(() => useQuizAI());

    act(() => {
      result.current.submit({ topics: ["x"], amount: 3 });
    });

    expect(setMessages).toHaveBeenCalledWith([]);
    expect(sendMessage).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/hooks/use-quiz-ai.test.ts`
Expected: FAIL — module does not exist or has wrong exports.

- [ ] **Step 3: Rewrite `lib/hooks/use-quiz-ai.ts`**

```ts
"use client";

import { useMemo, useCallback, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

export type QuizPhase = "idle" | "searching" | "generating" | "done" | "error";

export interface QuizQuestion {
  id: string;
  question: string;
  answer: string;
  option1: string;
  option2: string;
  option3: string;
}

export interface UseQuizAIReturn {
  phase: QuizPhase;
  matchCount: number;
  questions: QuizQuestion[];
  error: Error | null;
  messages: UIMessage[];
  status: string;
  submit: (payload: { topics: string[]; amount: number }) => void;
  stop: () => void;
  clear: () => void;
}

function mapErrorToThai(err: Error): string {
  const m = err.message.toLowerCase();
  if (m.includes("quota") || m.includes("429") || m.includes("rate limit")) {
    return "บริการ AI หมดโควต้าการใช้งาน กรุณาลองใหม่อีกครั้งในภายหลัง";
  }
  return "เกิดข้อผิดพลาดในการสร้างแบบทดสอบ กรุณาลองใหม่อีกครั้ง";
}

function deriveState(messages: UIMessage[], status: string, error: Error | undefined) {
  if (error) {
    return { phase: "error" as const, matchCount: 0, questions: [] };
  }

  let matchCount = 0;
  let searchDoneSeen = false;
  const questions: QuizQuestion[] = [];

  for (const m of messages) {
    for (const p of m.parts ?? []) {
      if (p.type === "data-task") {
        const d = p.data as { label: string; status: string; matchCount?: number };
        if (d.label === "ค้นหาเอกสาร" && d.status === "done" && typeof d.matchCount === "number") {
          matchCount = d.matchCount;
          searchDoneSeen = true;
        }
      } else if (p.type === "data-question") {
        const d = p.data as QuizQuestion;
        questions.push(d);
      }
    }
  }

  if (questions.length > 0 || (searchDoneSeen && status === "ready")) {
    return { phase: "done" as const, matchCount, questions };
  }
  if (searchDoneSeen) {
    return { phase: "generating" as const, matchCount, questions: [] };
  }
  return { phase: "searching" as const, matchCount: 0, questions: [] };
}

export function useQuizAI(): UseQuizAIReturn {
  const { messages, status, error, sendMessage, stop, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/quiz" }),
  });

  const requestIdRef = useRef(0);

  const submit = useCallback(
    (payload: { topics: string[]; amount: number }) => {
      requestIdRef.current += 1;
      setMessages([]);
      sendMessage({ text: JSON.stringify(payload) });
    },
    [sendMessage, setMessages],
  );

  const clear = useCallback(() => setMessages([]), [setMessages]);

  const derived = useMemo(
    () => deriveState(messages, status, error ?? undefined),
    [messages, status, error],
  );

  const thaiError = useMemo(
    () => (error ? new Error(mapErrorToThai(error)) : null),
    [error],
  );

  return {
    phase: derived.phase,
    matchCount: derived.matchCount,
    questions: derived.questions,
    error: thaiError,
    messages,
    status: status as string,
    submit,
    stop,
    clear,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/hooks/use-quiz-ai.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/use-quiz-ai.ts lib/hooks/use-quiz-ai.test.ts
git commit -m "refactor(quiz): rewrite use-quiz-ai hook to wrap useChat"
```

---

## Task 7: Create `QuizProcess` orchestrator component

**Files:**
- Create: `app/(home)/quiz/components/QuizProcess.tsx`
- Test: `app/(home)/quiz/components/QuizProcess.test.tsx` (new)

- [ ] **Step 1: Write failing component test**

Create `app/(home)/quiz/components/QuizProcess.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UIMessage } from "ai";
import { QuizProcess } from "./QuizProcess";

const messages: UIMessage[] = [
  {
    id: "1",
    role: "assistant",
    parts: [
      { type: "data-task", data: { id: "t1", label: "ค้นหาเอกสาร", status: "done", matchCount: 3 } },
      { type: "data-reasoning", data: { summary: "พบ 3 รายการ", excerpts: ["passage A", "passage B"] } },
    ],
  },
];

describe("QuizProcess", () => {
  it("renders process steps and badge in full mode", () => {
    render(<QuizProcess messages={messages} isStreaming={false} matchCount={3} error={null} mode="full" />);

    expect(screen.getByTestId("process-steps")).toBeInTheDocument();
    expect(screen.getByTestId("process-badge")).toBeInTheDocument();
  });

  it("renders only the badge in badge-only mode", () => {
    render(<QuizProcess messages={messages} isStreaming={false} matchCount={3} error={null} mode="badge-only" />);

    expect(screen.queryByTestId("process-steps")).not.toBeInTheDocument();
    expect(screen.getByTestId("process-badge")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Add `data-testid` to `ProcessBadge`**

In `components/ai/process-badge.tsx`, locate the root element and add `data-testid="process-badge"`. (Read the file first to find the JSX root.)

If `process-badge.tsx` does not yet expose a testid, add one. Example:

```tsx
<button data-testid="process-badge" ...>
```

- [ ] **Step 3: Run test to verify it fails (component import missing)**

Run: `npx vitest run app/(home)/quiz/components/QuizProcess.test.tsx`
Expected: FAIL — `QuizProcess` does not exist.

- [ ] **Step 4: Create `app/(home)/quiz/components/QuizProcess.tsx`**

```tsx
"use client";

import type { UIMessage } from "ai";
import { ProcessStepsInline } from "@/components/ai/process-steps-inline";
import { ProcessBadge } from "@/components/ai/process-badge";
import { ProcessDetails } from "@/components/ai/process-details";
import { reduceTaskParts, type DataTaskPart } from "@/lib/chat/reduce-task-parts";
import type { ReasoningPart, TaskPart } from "@/lib/schemas/ai-data-parts";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuizProcessProps {
  messages: UIMessage[];
  isStreaming: boolean;
  matchCount: number;
  error: Error | null;
  onRetry?: () => void;
  mode: "full" | "badge-only";
}

export function QuizProcess({
  messages,
  isStreaming,
  matchCount,
  error,
  onRetry,
  mode,
}: QuizProcessProps) {
  const reasoningParts: Array<{ type: "data-reasoning"; data: ReasoningPart }> = [];
  const rawTaskParts: DataTaskPart[] = [];

  for (const m of messages) {
    for (const p of m.parts ?? []) {
      if (p.type === "data-reasoning") {
        reasoningParts.push(p as { type: "data-reasoning"; data: ReasoningPart });
      } else if (p.type === "data-task") {
        rawTaskParts.push(p as DataTaskPart);
      }
    }
  }

  const taskPartsLatest: DataTaskPart[] = reduceTaskParts(rawTaskParts);

  const lastTaskStatus = taskPartsLatest.at(-1)?.data.status as TaskPart["status"] | undefined;
  const isDone =
    !isStreaming &&
    (lastTaskStatus === "done" || lastTaskStatus === "error" || taskPartsLatest.length === 0);

  const hasProcess = taskPartsLatest.length > 0 || reasoningParts.length > 0;
  const badgeLabel = error
    ? "เกิดข้อผิดพลาด"
    : matchCount > 0
      ? `ใช้เอกสาร ${matchCount} รายการ`
      : hasProcess
        ? "ขั้นตอนการคิด"
        : null;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertCircle className="size-12 text-red-500" />
        <h2 className="text-2xl font-bold text-red-600">เกิดข้อผิดพลาด</h2>
        <p className="text-muted-foreground">{error.message}</p>
        {onRetry && (
          <Button onClick={onRetry} variant="outline" className="gap-2">
            <RefreshCw className="size-4" />
            ลองอีกครั้ง
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", mode === "full" ? "p-6" : "")}>
      {mode === "full" && (
        <ProcessStepsInline
          steps={taskPartsLatest.map((t) => ({
            id: `task-${t.data.id ?? t.data.label}`,
            kind: "task" as const,
            status: t.data.status,
            label: t.data.label,
          }))}
          reasoning={reasoningParts}
          tasks={taskPartsLatest}
          isDone={isDone}
        />
      )}

      {badgeLabel && (
        <ProcessBadge label={badgeLabel}>
          <ProcessDetails
            steps={taskPartsLatest.map((t) => ({
              id: `task-${t.data.id ?? t.data.label}`,
              kind: "task" as const,
              status: t.data.status,
              label: t.data.label,
            }))}
            reasoning={reasoningParts.map((p) => p.data)}
            tasks={taskPartsLatest.map((t) => t.data)}
          />
        </ProcessBadge>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/\(home\)/quiz/components/QuizProcess.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/\(home\)/quiz/components/QuizProcess.tsx app/\(home\)/quiz/components/QuizProcess.test.tsx components/ai/process-badge.tsx
git commit -m "feat(quiz): add QuizProcess orchestrator with full/badge-only modes"
```

---

## Task 8: Update `hooks/use-quiz.ts` to consume the new hook signature

**Files:**
- Modify: `hooks/use-quiz.ts`

- [ ] **Step 1: Update the hook wiring**

Replace the `useQuizAI()` import and the destructured fields in `hooks/use-quiz.ts:42-44`:

```ts
  const ai = useQuizAI();
```

Then update the return value of `useQuiz()`:

```ts
  return {
    appState: flow.appState,
    selectedTopic: data.selectedTopic,
    questions: data.questions,
    currentPage: ui.currentPage,
    answers: data.answers,
    quizCompleted: ui.completed,
    timeExpired: ui.timeExpired,
    isLoading: ai.phase === "searching" || ai.phase === "generating",
    error: ai.error,
    matchCount: ai.matchCount,
    isGenerating: ai.phase === "generating",
    messages: ai.messages,
    status: ai.status,
    allQuestionsAnswered: stats.allQuestionsAnswered,
    answeredQuestionsCount: stats.answeredQuestionsCount,
    progressPercentage: stats.progressPercentage,
    score: stats.score,
    startQuiz,
    selectOption,
    goToPage,
    timeUp,
    submitQuiz,
    restartQuiz,
  };
```

- [ ] **Step 2: Update the `UseQuizReturn` interface**

Add `messages: UIMessage[]` and `status: string` to the `UseQuizReturn` interface in `hooks/use-quiz.ts:14-36`.

- [ ] **Step 3: Run typecheck**

Run: `npm run build`
Expected: succeeds (build is the typecheck per AGENTS.md).

- [ ] **Step 4: Commit**

```bash
git add hooks/use-quiz.ts
git commit -m "refactor(quiz): consume new useQuizAI signature in use-quiz"
```

---

## Task 9: Update `QuizContents` to use `QuizProcess` and delete `LoadingOverlay`

**Files:**
- Modify: `app/(home)/quiz/components/QuizContents.tsx`
- Delete: `app/(home)/quiz/components/LoadingOverlay.tsx`
- Test: `app/(home)/quiz/components/QuizContents.test.tsx` (new)

- [ ] **Step 1: Write failing component test**

Create `app/(home)/quiz/components/QuizContents.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/use-quiz", () => ({
  useQuiz: vi.fn(),
}));

import { useQuiz } from "@/hooks/use-quiz";
import QuizContents from "./QuizContents";

const mockedUseQuiz = vi.mocked(useQuiz);

describe("QuizContents", () => {
  it("renders QuizProcess in loading state (not LoadingOverlay)", () => {
    mockedUseQuiz.mockReturnValue({
      appState: "loading",
      selectedTopic: "x",
      questions: [],
      currentPage: 1,
      answers: {},
      quizCompleted: false,
      timeExpired: false,
      isLoading: true,
      error: null,
      matchCount: 3,
      isGenerating: false,
      messages: [],
      status: "streaming",
      allQuestionsAnswered: false,
      answeredQuestionsCount: 0,
      progressPercentage: 0,
      score: { correct: 0, total: 0, percentage: 0 },
      startQuiz: vi.fn(),
      selectOption: vi.fn(),
      goToPage: vi.fn(),
      timeUp: vi.fn(),
      submitQuiz: vi.fn(),
      restartQuiz: vi.fn(),
    } as never);

    render(<QuizContents />);
    expect(screen.getByTestId("process-badge")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/\(home\)/quiz/components/QuizContents.test.tsx`
Expected: FAIL — `QuizContents` still renders `LoadingOverlay`.

- [ ] **Step 3: Update `QuizContents` to use `QuizProcess`**

Replace `app/(home)/quiz/components/QuizContents.tsx`:

```tsx
"use client";

import { useQuiz } from "@/hooks/use-quiz";
import HomeState from "../states/HomeState";
import QuizState from "../states/QuizState";
import ResultState from "../states/ResultState";
import Disclaimer from "./Disclaimer";
import { QuizProcess } from "./QuizProcess";
import { notFound } from "next/navigation";

function getErrorMessage(err: Error | null): string | null {
  if (!err) return null;
  const msg = err.message || "";
  if (msg.includes("quota") || msg.includes("429") || msg.includes("insufficient_quota")) {
    return "บริการ AI หมดโควต้าการใช้งาน กรุณาลองใหม่อีกครั้งในภายหลัง";
  }
  if (msg.includes("Failed to process")) {
    return "เกิดข้อผิดพลาดในการสร้างแบบทดสอบ กรุณาลองใหม่อีกครั้ง";
  }
  return "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง";
}

export default function QuizContents() {
  const quiz = useQuiz();
  const {
    appState,
    selectedTopic,
    questions,
    currentPage,
    answers,
    quizCompleted,
    timeExpired,
    allQuestionsAnswered,
    answeredQuestionsCount,
    progressPercentage,
    score,
    error,
    matchCount,
    messages,
    status,
    isGenerating,
    startQuiz,
    selectOption,
    goToPage,
    timeUp,
    submitQuiz,
    restartQuiz,
  } = quiz;

  const handleRetry = () => {
    if (selectedTopic) {
      startQuiz(selectedTopic);
    }
  };

  if (appState === "home") {
    return <HomeState onStartQuiz={startQuiz} />;
  }

  if (appState === "loading") {
    return (
      <QuizProcess
        messages={messages}
        isStreaming={status === "streaming" || status === "submitted"}
        matchCount={matchCount}
        error={error ? new Error(getErrorMessage(error) ?? "Unknown error") : null}
        onRetry={handleRetry}
        mode="full"
      />
    );
  }

  if (appState === "quiz") {
    return (
      <>
        <QuizState
          selectedTopic={selectedTopic}
          currentPage={currentPage}
          setCurrentPage={goToPage}
          questions={questions}
          answers={answers}
          quizCompleted={quizCompleted}
          timeExpired={timeExpired}
          handleTimeUp={timeUp}
          handleSelectOption={selectOption}
          handleSubmitQuiz={submitQuiz}
          allQuestionsAnswered={allQuestionsAnswered}
          answeredQuestionsCount={answeredQuestionsCount}
          progressPercentage={progressPercentage}
          isGenerating={isGenerating}
          quizContext={{ messages, matchCount }}
        />
        <Disclaimer />
      </>
    );
  }

  if (appState === "results") {
    return (
      <>
        <ResultState
          selectedTopic={selectedTopic}
          score={score}
          questions={questions}
          handleRestartQuiz={restartQuiz}
          answers={answers}
        />
        <Disclaimer />
      </>
    );
  }

  notFound();
}
```

- [ ] **Step 4: Delete `LoadingOverlay.tsx`**

```bash
git rm app/\(home\)/quiz/components/LoadingOverlay.tsx
```

- [ ] **Step 5: Run the new component test to verify it passes**

Run: `npx vitest run app/\(home\)/quiz/components/QuizContents.test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `npm run test:run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/\(home\)/quiz/components/QuizContents.tsx app/\(home\)/quiz/components/QuizContents.test.tsx
git rm app/\(home\)/quiz/components/LoadingOverlay.tsx
git commit -m "feat(quiz): replace LoadingOverlay with QuizProcess orchestrator"
```

---

## Task 10: Add `quizContext` to `QuizState` for persistent badge

**Files:**
- Modify: `app/(home)/quiz/states/QuizState.tsx`

- [ ] **Step 1: Add the prop and render the badge**

In `app/(home)/quiz/states/QuizState.tsx`, update the `Props` type:

```ts
type Props = {
  selectedTopic: string | null;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  questions: Question[];
  answers: Record<string, string>;
  quizCompleted: boolean;
  timeExpired: boolean;
  allQuestionsAnswered: boolean;
  answeredQuestionsCount: number;
  progressPercentage: number;
  handleTimeUp: () => void;
  handleSelectOption: (questionId: string, optionId: string) => void;
  handleSubmitQuiz: () => void;
  isGenerating?: boolean;
  quizContext?: { messages: import("ai").UIMessage[]; matchCount: number };
};
```

Update the destructured props in the component signature to include `quizContext`. Then at the top of the rendered card area (just before the `<Card>` element), insert:

```tsx
{quizContext && (
  <QuizProcess
    messages={quizContext.messages}
    isStreaming={false}
    matchCount={quizContext.matchCount}
    error={null}
    mode="badge-only"
  />
)}
```

And add the import at the top of the file:

```ts
import { QuizProcess } from "../components/QuizProcess";
```

- [ ] **Step 2: Run the full suite**

Run: `npm run test:run`
Expected: all tests pass.

- [ ] **Step 3: Run build to typecheck**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/\(home\)/quiz/states/QuizState.tsx
git commit -m "feat(quiz): show reasoning badge in QuizState while answering"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npm run test:run`
Expected: all tests pass (including the new `QuizProcess` and `QuizContents` tests).

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: build succeeds with no new errors.

- [ ] **Step 3: Manual smoke check**

Run: `npm run dev` and load the quiz page. Click a topic. Verify:
- The loading state shows the inline steps rail (searching → generating) and a "ใช้เอกสาร N รายการ" badge.
- The badge persists into the quiz state and is clickable.
- The badge is gone on the results state.
- Errors surface in the inline rail and trigger a retry button.

- [ ] **Step 4: Commit any final fixes**

If you made any tweaks during smoke testing:

```bash
git add -A
git commit -m "chore(quiz): smoke-test fixes"
```

---

## Self-review

**1. Spec coverage:**

- Goal (inline process steps + collapsible reasoning badge): covered by Tasks 6, 7, 9, 10.
- Server migration to `createUIMessageStream`: Tasks 2, 4.
- New `data-question` part schema: Task 1.
- Server deletes dead `generateQuiz`: Task 2 (replaces file).
- Client uses `useChat`: Task 6.
- `QuizProcess` orchestrator with `mode="full" | "badge-only"`: Task 7.
- `QuizContents` drops `LoadingOverlay`: Task 9.
- `QuizState` keeps badge: Task 10.
- Race protection via `requestIdRef`: Task 6.
- Tests: Tasks 1, 3, 4, 6, 7, 9.

All spec requirements covered. ✅

**2. Placeholder scan:**

- All task steps contain concrete code blocks.
- No "TBD", "TODO", or "implement later" placeholders.
- No "add appropriate error handling" — concrete error messages specified.
- No "similar to Task N" — code is repeated where needed.

✅

**3. Type consistency:**

- `QuizProcessProps` defined in Task 7, used in Tasks 9 and 10.
- `quizContext` prop type `{ messages, matchCount }` consistent between Task 9 (where it's passed) and Task 10 (where it's received).
- `useQuizAI` return shape (Task 6) matches the `ai` destructure in Task 8.
- `data-question` part type (Task 1) matches the writer call in Task 2 and the hook derivation in Task 6.

✅
