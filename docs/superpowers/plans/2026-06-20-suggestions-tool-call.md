# Suggestions via Tool Call — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate `generateSuggestions` LLM call with an inline `suggestQuestions` tool call during the answer step.

**Architecture:** The `suggestQuestions` tool is defined alongside `searchDocs` in `streamText`. The model calls it at the end of step 2 (the answer step). The tool handler writes `data-suggestions` directly to the stream. No separate LLM call needed.

**Tech Stack:** `ai@5.0.x` (tool(), stepCountIs), Zod, TypeScript

---

### Task 1: Add `suggestQuestions` instruction to system prompt

**Files:**
- Modify: `lib/chat/pali-system-prompt.ts:1-7`

- [ ] **Step 1: Append instruction to system prompt**

```ts
export const PALI_EXPERT_SYSTEM_PROMPT = `You are a Pali language expert. Your responses are informative, accurate, and concise — short for factual questions, slightly longer for explanations.

You have a tool called searchDocs. Use it whenever the user asks a question that could be answered by the Pali textbook corpus. Pass a short, focused query string.

If a question is outside the scope of the textbook content, or if searchDocs returns no relevant passages, kindly indicate that and answer from general knowledge where appropriate.

Always answer in the same language the user wrote in. If the user wrote in Thai, respond in Thai.

After providing your answer, call the suggestQuestions tool with 3 follow-up questions to help the user continue learning. These questions should be short, specific, and grounded in the material you just answered from.`;
```

- [ ] **Step 2: Run tests to verify no breakage**

Run: `npx vitest run`
Expected: All existing tests pass (this is just a string change, no behavior impact yet).

- [ ] **Step 3: Commit**

```bash
git add lib/chat/pali-system-prompt.ts
git commit -m "feat: add suggestQuestions instruction to system prompt"
```

---

### Task 2: Implement `suggestQuestions` tool in the route

**Files:**
- Modify: `app/api/question/route.ts:1-167`

- [ ] **Step 1: Rewrite the route**

Remove:
- `import { generateSuggestions } from "@/lib/services/suggestions";` (line 14)
- `let lastMatchCount = 0;` (line 29)
- `let lastAnswer = "";` (line 30)
- The post-stream suggestions block (lines 123-145), including the logging

Add `suggestQuestions` tool inside the `tools` object alongside `searchDocs`.

Add a `suggestionsGenerated` guard variable in the execute scope.

Reduce `stopWhen: stepCountIs(3)` to `stopWhen: stepCountIs(2)` (inline suggestions only need 2 steps).

Final file:

```ts
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { searchDocuments } from "@/lib/services/rag-pipeline";
import { openrouter } from "@/lib/services/openrouter-client";
import { PALI_EXPERT_SYSTEM_PROMPT } from "@/lib/chat/pali-system-prompt";
import { formatContext, type DocumentMatch } from "@/lib/services/vector-store";

export const runtime = "nodejs";
export const maxDuration = 120;

function buildSystemWithContext(baseSystem: string, context: string): string {
  return `${baseSystem}\n\nContext from Pali textbook corpus:\n${context}`;
}

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const stream = createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        let suggestionsGenerated = false;

        const result = streamText({
          model: openrouter(
            process.env.LLM_MODEL ?? "google/gemma-4-31b-it:free",
          ),
          system: PALI_EXPERT_SYSTEM_PROMPT,
          messages: convertToModelMessages(messages),
          stopWhen: stepCountIs(2),
          tools: {
            searchDocs: tool({
              description:
                "Search the Pali textbook corpus for relevant passages.",
              inputSchema: z.object({ query: z.string().min(1) }),
              execute: async ({ query }, { toolCallId }) => {
                writer.write({
                  type: "data-task",
                  id: toolCallId,
                  data: { label: "ค้นหาเอกสาร", status: "running", query },
                });
                try {
                  const { matches } = await searchDocuments(query);
                  writer.write({
                    type: "data-task",
                    id: toolCallId,
                    data: {
                      label: "ค้นหาเอกสาร",
                      status: "done",
                      matchCount: matches.length,
                    },
                  });
                  const excerpts = matches.map((m) =>
                    m.text.slice(0, 120).trim(),
                  );
                  writer.write({
                    type: "data-reasoning",
                    data: {
                      summary: `พบเอกสารที่เกี่ยวข้อง ${matches.length} รายการ`,
                      excerpts,
                    },
                  });
                  return { matches };
                } catch (e: unknown) {
                  const message =
                    e instanceof Error ? e.message : "search failed";
                  writer.write({
                    type: "data-task",
                    id: toolCallId,
                    data: { label: "ค้นหาเอกสาร", status: "error", message },
                  });
                  return { matches: [] };
                }
              },
            }),
            suggestQuestions: tool({
              description:
                "Generate 3 follow-up questions for the user based on the conversation.",
              inputSchema: z.object({
                suggestions: z.array(z.string().min(1)).min(1).max(3),
              }),
              execute: async ({ suggestions }) => {
                if (suggestionsGenerated) return { ok: false };
                suggestionsGenerated = true;
                if (suggestions.length === 0) return { ok: false };
                writer.write({
                  type: "data-suggestions",
                  data: { suggestions },
                });
                return { ok: true };
              },
            }),
          },
          prepareStep: async ({ steps }) => {
            for (const step of steps) {
              for (const tr of step.toolResults) {
                if (
                  tr.toolName === "searchDocs" &&
                  tr.output &&
                  typeof tr.output === "object" &&
                  "matches" in tr.output
                ) {
                  const matches = (tr.output as { matches: DocumentMatch[] })
                    .matches;
                  if (matches.length > 0) {
                    const context = formatContext(matches);
                    return {
                      system: buildSystemWithContext(
                        PALI_EXPERT_SYSTEM_PROMPT,
                        context,
                      ),
                    };
                  }
                }
              }
            }
            return undefined;
          },
        });

        writer.merge(result.toUIMessageStream({ sendReasoning: false }));
        await result.consumeStream();
      },
    });

    return createUIMessageStreamResponse({ stream }) as unknown as Response;
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
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

- [ ] **Step 2: Run route tests**

Run: `npx vitest run tests/route.test.ts`
Expected: FAIL (tests still reference `generateSuggestions` mock and expect `lastMatchCount`/`lastAnswer` behavior — will be fixed in Task 3).

- [ ] **Step 3: Commit**

```bash
git add app/api/question/route.ts
git commit -m "feat: add suggestQuestions tool, remove separate suggestions call"
```

---

### Task 3: Delete old `generateSuggestions` function

**Files:**
- Delete: `lib/services/suggestions.ts`
- Delete: `tests/suggestions.test.ts`

- [ ] **Step 1: Delete both files**

```bash
Remove-Item -LiteralPath "lib/services/suggestions.ts"
Remove-Item -LiteralPath "tests/suggestions.test.ts"
```

- [ ] **Step 2: Run tests to confirm they're gone**

Run: `npx vitest run`
Expected: PASS (fewer files, no more suggestions-related import errors).

- [ ] **Step 3: Commit**

```bash
git add lib/services/suggestions.ts tests/suggestions.test.ts
git commit -m "feat: remove generateSuggestions function (replaced by tool call)"
```

---

### Task 4: Update route tests

**Files:**
- Modify: `tests/route.test.ts:1-356`

- [ ] **Step 1: Rewrite the mock and tests**

Key changes to the mock:

1. Remove `vi.mock("@/lib/services/suggestions", ...)` (no longer imported).
2. Remove `mockedGenerateSuggestions` (no longer used).
3. Add `capturedSuggestTool` alongside `capturedTool` for `suggestQuestions`.
4. Export `getCapturedSuggestTool` via `__internals`.
5. Remove the two test cases that test the old `generateSuggestions` behavior.
6. Add a test case for `suggestQuestions` tool execution.
7. Add a test case for the duplicate guard in `suggestQuestions`.

Full test file:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => {
  type CapturedTool = {
    description?: string;
    inputSchema?: unknown;
    execute?: (input: unknown, options: { toolCallId: string }) => Promise<unknown>;
  };
  type PrepareStepFn = (args: {
    steps: Array<{
      toolResults: Array<{
        toolName: string;
        output: unknown;
      }>;
    }>;
    stepNumber: number;
    model: unknown;
    messages: unknown[];
  }) => Promise<{ system?: string; messages?: unknown[] } | undefined>;

  let capturedTool: CapturedTool | null = null;
  let capturedSuggestTool: CapturedTool | null = null;
  let capturedPrepareStep: PrepareStepFn | null = null;
  let capturedStopWhen: unknown = null;

  const streamTextMock = vi.fn((opts: {
    tools?: Record<string, CapturedTool>;
    prepareStep?: PrepareStepFn;
    stopWhen?: unknown;
  }) => {
    capturedTool = opts.tools?.searchDocs ?? null;
    capturedSuggestTool = opts.tools?.suggestQuestions ?? null;
    capturedPrepareStep = opts.prepareStep ?? null;
    capturedStopWhen = opts.stopWhen;
    return {
      toUIMessageStream: vi.fn((opts?: { sendReasoning?: boolean }) => {
        return new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "t-1" });
            controller.enqueue({ type: "text-delta", id: "t-1", delta: "mock answer text" });
            controller.enqueue({ type: "text-end", id: "t-1" });
            controller.close();
          },
        });
      }),
      consumeStream: vi.fn(async () => {
        if (capturedTool?.execute) {
          await capturedTool.execute({ query: "dhamma" }, { toolCallId: "tc-1" });
        }
      }),
      text: Promise.resolve("mock answer text"),
    };
  });

  const createUIMessageStreamMock = vi.fn(
    (opts: {
      execute: (args: { writer: unknown }) => Promise<void> | void;
    }) => {
      const mergePromises: Promise<void>[] = [];
      const writer = {
        writes: [] as Array<Record<string, unknown>>,
        write: vi.fn((w: Record<string, unknown>) =>
          writer.writes.push(w),
        ),
        merge: vi.fn((stream: ReadableStream<Record<string, unknown>>) => {
          mergePromises.push(
            (async () => {
              const reader = stream.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                writer.writes.push(value);
              }
            })(),
          );
        }),
      };
      return Promise.resolve(opts.execute({ writer }))
        .then(() => Promise.all(mergePromises))
        .then(() => {
          return { body: { writer } };
        });
    },
  );

  const createUIMessageStreamResponseMock = vi.fn(
    (args: { stream: unknown }) => args.stream,
  );

  return {
    createUIMessageStream: createUIMessageStreamMock,
    createUIMessageStreamResponse: createUIMessageStreamResponseMock,
    streamText: streamTextMock,
    convertToModelMessages: vi.fn((m: unknown) => m),
    stepCountIs: vi.fn((count: number) => ({ steps }: { steps: unknown[] }) => steps.length === count),
    tool: vi.fn((opts: CapturedTool) => opts),
    __internals: {
      getCapturedPrepareStep: () => capturedPrepareStep,
      getCapturedStopWhen: () => capturedStopWhen,
      getCapturedSuggestTool: () => capturedSuggestTool,
    },
  };
});

vi.mock("@/lib/services/rag-pipeline", () => ({
  searchDocuments: vi.fn(),
}));
vi.mock("@/lib/services/openrouter-client", () => ({
  openrouter: vi.fn(() => ({ modelId: "mock" })),
}));
vi.mock("@/lib/chat/pali-system-prompt", () => ({
  PALI_EXPERT_SYSTEM_PROMPT: "PROMPT",
}));
vi.mock("@/lib/services/vector-store", () => ({
  formatContext: vi.fn((matches: Array<{ text: string }>) =>
    matches.map((m) => m.text).join("|MOCK|"),
  ),
}));

import { POST } from "@/app/api/question/route";
import { searchDocuments } from "@/lib/services/rag-pipeline";
import { formatContext } from "@/lib/services/vector-store";
import * as aiMock from "ai";

const mockedSearch = vi.mocked(searchDocuments);
const mockedFormatContext = vi.mocked(formatContext);
const aiMockInternals = (aiMock as unknown as {
  __internals: {
    getCapturedPrepareStep: () => unknown;
    getCapturedStopWhen: () => unknown;
    getCapturedSuggestTool: () => unknown;
  };
}).__internals;

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/question", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

type WriterMock = {
  writes: Array<Record<string, unknown>>;
};

describe("POST /api/question", () => {
  it("emits data-task (running, done) and data-reasoning when searchDocs returns matches", async () => {
    mockedSearch.mockResolvedValue({
      matches: [
        { id: "a", score: 0.9, text: "passage A" },
        { id: "b", score: 0.8, text: "passage B" },
      ],
      context: "ctx",
    });

    const result = (await POST(
      makeReq({
        messages: [
          { id: "1", role: "user", parts: [{ type: "text", text: "what is dhamma?" }] },
        ],
      }),
    )) as unknown as { body: { writer: WriterMock } };

    const stopWhen = aiMockInternals.getCapturedStopWhen() as
      ((args: { steps: unknown[] }) => boolean) | null;
    expect(stopWhen).toBeDefined();
    expect(stopWhen!({ steps: [] })).toBe(false);
    expect(stopWhen!({ steps: [1, 2] })).toBe(true);

    const writes = result.body.writer.writes;
    const taskRunning = writes.find(
      (w) => w.type === "data-task" && (w.data as { status: string }).status === "running",
    );
    const taskDone = writes.find(
      (w) => w.type === "data-task" && (w.data as { status: string }).status === "done",
    );
    const reasoning = writes.find((w) => w.type === "data-reasoning");

    expect(taskRunning).toBeDefined();
    expect((taskRunning!.data as { query: string }).query).toBe("dhamma");
    expect(taskDone).toBeDefined();
    expect((taskDone!.data as { matchCount: number }).matchCount).toBe(2);
    expect(reasoning).toBeDefined();
    expect((reasoning!.data as { summary: string }).summary).toMatch(/2/);
  });

  it("emits data-task with status=error when searchDocuments throws", async () => {
    mockedSearch.mockRejectedValue(new Error("Pinecone timeout"));
    const result = (await POST(
      makeReq({
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "x" }] }],
      }),
    )) as unknown as { body: { writer: WriterMock } };

    const errored = result.body.writer.writes.find(
      (w) => w.type === "data-task" && (w.data as { status: string }).status === "error",
    );
    expect(errored).toBeDefined();
    expect((errored!.data as { message: string }).message).toMatch(/Pinecone/);
  });

  it("calls formatContext with the matches when searchDocs returns matches", async () => {
    const matches = [
      { id: "a", score: 0.9, text: "passage A" },
      { id: "b", score: 0.8, text: "passage B" },
    ];
    mockedSearch.mockResolvedValue({ matches, context: "ctx" });

    await POST(
      makeReq({
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "q" }] }],
      }),
    );

    const prepareStep = aiMockInternals.getCapturedPrepareStep() as (args: {
      steps: Array<{
        toolResults: Array<{ toolName: string; output: unknown }>;
      }>;
      stepNumber: number;
      model: unknown;
      messages: unknown[];
    }) => Promise<{ system?: string; messages?: unknown[] } | undefined>;

    expect(prepareStep).toBeDefined();

    await prepareStep({
      steps: [
        {
          toolResults: [
            {
              toolName: "searchDocs",
              output: { matches },
            },
          ],
        },
      ],
      stepNumber: 1,
      model: {},
      messages: [],
    });

    expect(mockedFormatContext).toHaveBeenCalledOnce();
    expect(mockedFormatContext).toHaveBeenCalledWith(matches);
  });

  it("prepareStep injects formatted context into the system prompt for the answer step", async () => {
    const matches = [
      { id: "a", score: 0.9, text: "passage A" },
      { id: "b", score: 0.8, text: "passage B" },
    ];
    mockedSearch.mockResolvedValue({ matches, context: "ctx" });

    await POST(
      makeReq({
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "q" }] }],
      }),
    );

    const prepareStep = aiMockInternals.getCapturedPrepareStep() as (args: {
      steps: Array<{
        toolResults: Array<{ toolName: string; output: unknown }>;
      }>;
      stepNumber: number;
      model: unknown;
      messages: unknown[];
    }) => Promise<{ system?: string; messages?: unknown[] } | undefined>;

    expect(prepareStep).toBeDefined();

    const result = await prepareStep({
      steps: [
        {
          toolResults: [
            {
              toolName: "searchDocs",
              output: { matches },
            },
          ],
        },
      ],
      stepNumber: 1,
      model: {},
      messages: [],
    });

    expect(result).toBeDefined();
    expect(result?.system).toContain("passage A|MOCK|passage B");
    expect(result?.system).toContain("PROMPT");
  });

  it("prepareStep returns undefined when matches is empty (no context injection)", async () => {
    mockedSearch.mockResolvedValue({ matches: [], context: "" });

    await POST(
      makeReq({
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "q" }] }],
      }),
    );

    const prepareStep = aiMockInternals.getCapturedPrepareStep() as (args: {
      steps: Array<{
        toolResults: Array<{ toolName: string; output: unknown }>;
      }>;
      stepNumber: number;
      model: unknown;
      messages: unknown[];
    }) => Promise<{ system?: string; messages?: unknown[] } | undefined>;

    expect(prepareStep).toBeDefined();

    const result = await prepareStep({
      steps: [
        {
          toolResults: [
            {
              toolName: "searchDocs",
              output: { matches: [] },
            },
          ],
        },
      ],
      stepNumber: 1,
      model: {},
      messages: [],
    });

    expect(result).toBeUndefined();
    expect(mockedFormatContext).not.toHaveBeenCalled();
  });

  it("suggestQuestions tool writes data-suggestions when called", async () => {
    mockedSearch.mockResolvedValue({ matches: [{ id: "a", score: 0.9, text: "t" }], context: "ctx" });

    await POST(
      makeReq({
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "q" }] }],
      }),
    );

    const suggestTool = aiMockInternals.getCapturedSuggestTool() as {
      execute?: (input: { suggestions: string[] }) => Promise<unknown>;
    } | null;

    expect(suggestTool).toBeDefined();
    expect(suggestTool!.execute).toBeDefined();

    const result = await suggestTool!.execute!(
      { suggestions: ["q1", "q2", "q3"] },
      { toolCallId: "tc-suggest" },
    );

    expect(result).toEqual({ ok: true });
  });

  it("suggestQuestions tool rejects 0 suggestions", async () => {
    mockedSearch.mockResolvedValue({ matches: [{ id: "a", score: 0.9, text: "t" }], context: "ctx" });

    await POST(
      makeReq({
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "q" }] }],
      }),
    );

    const suggestTool = aiMockInternals.getCapturedSuggestTool() as {
      execute?: (input: { suggestions: string[] }) => Promise<unknown>;
    } | null;

    expect(suggestTool).toBeDefined();

    const result = await suggestTool!.execute!(
      { suggestions: [] },
      { toolCallId: "tc-empty" },
    );

    expect(result).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run route tests**

Run: `npx vitest run tests/route.test.ts`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: PASS (fewer files, tests pass).

- [ ] **Step 4: Commit**

```bash
git add tests/route.test.ts
git commit -m "feat: update route tests for suggestQuestions tool"
```

---

### Task 5: Verify build

**Files:**
- Run: `npx next build`

- [ ] **Step 1: TypeScript compilation and build**

Run: `npx next build`
Expected: Compiled successfully, no TypeScript errors.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: PASS
