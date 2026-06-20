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
