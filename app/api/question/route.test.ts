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
  let capturedPrepareStep: PrepareStepFn | null = null;

  const streamTextMock = vi.fn((opts: {
    tools?: Record<string, CapturedTool>;
    prepareStep?: PrepareStepFn;
  }) => {
    capturedTool = opts.tools?.searchDocs ?? null;
    capturedPrepareStep = opts.prepareStep ?? null;
    return {
      toUIMessageStream: vi.fn(() => {
        return new ReadableStream({
          start(controller) {
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
      const writer = {
        writes: [] as Array<{ type: string; data: unknown; id?: string }>,
        write: vi.fn((w: { type: string; data: unknown; id?: string }) =>
          writer.writes.push(w),
        ),
        merge: vi.fn(),
      };
      return Promise.resolve(opts.execute({ writer })).then(() => {
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
    tool: vi.fn((opts: CapturedTool) => opts),
    __internals: {
      getCapturedPrepareStep: () => capturedPrepareStep,
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
vi.mock("@/lib/services/suggestions", () => ({
  generateSuggestions: vi.fn(),
}));
vi.mock("@/lib/services/vector-store", () => ({
  formatContext: vi.fn((matches: Array<{ text: string }>) =>
    matches.map((m) => m.text).join("|MOCK|"),
  ),
}));

import { POST } from "./route";
import { searchDocuments } from "@/lib/services/rag-pipeline";
import { generateSuggestions } from "@/lib/services/suggestions";
import { formatContext } from "@/lib/services/vector-store";
import * as aiMock from "ai";

const mockedSearch = vi.mocked(searchDocuments);
const mockedGenerateSuggestions = vi.mocked(generateSuggestions);
const mockedFormatContext = vi.mocked(formatContext);
const aiMockInternals = (aiMock as unknown as {
  __internals: { getCapturedPrepareStep: () => unknown };
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
  writes: Array<{ type: string; data: unknown; id?: string }>;
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
    mockedGenerateSuggestions.mockResolvedValue(["q1", "q2", "q3"]);

    const result = (await POST(
      makeReq({
        messages: [
          { id: "1", role: "user", parts: [{ type: "text", text: "what is dhamma?" }] },
        ],
      }),
    )) as unknown as { body: { writer: WriterMock } };

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

  it("skips data-suggestions when matches is empty", async () => {
    mockedSearch.mockResolvedValue({ matches: [], context: "" });
    const result = (await POST(
      makeReq({
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "hi" }] }],
      }),
    )) as unknown as { body: { writer: WriterMock } };

    const suggestionWrites = result.body.writer.writes.filter(
      (w) => w.type === "data-suggestions",
    );
    expect(suggestionWrites).toHaveLength(0);
    expect(mockedGenerateSuggestions).not.toHaveBeenCalled();
  });

  it("emits data-suggestions when matches > 0", async () => {
    mockedSearch.mockResolvedValue({ matches: [{ id: "a" } as never], context: "ctx" });
    mockedGenerateSuggestions.mockResolvedValue(["q1", "q2", "q3"]);

    const result = (await POST(
      makeReq({
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "x" }] }],
      }),
    )) as unknown as { body: { writer: WriterMock } };

    const suggestionWrites = result.body.writer.writes.filter(
      (w) => w.type === "data-suggestions",
    );
    expect(suggestionWrites.length).toBeGreaterThanOrEqual(1);
    expect(mockedGenerateSuggestions).toHaveBeenCalledOnce();
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
    mockedGenerateSuggestions.mockResolvedValue(["q1", "q2", "q3"]);

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
    mockedGenerateSuggestions.mockResolvedValue(["q1", "q2", "q3"]);

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
});
