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
      "data-status",
      "data-task",
      "data-task",
      "data-reasoning",
      "data-status",
      "data-question",
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
