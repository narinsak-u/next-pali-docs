import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  streamText: vi.fn(),
  tool: vi.fn((opts) => opts),
  stepCountIs: vi.fn(() => vi.fn()),
}));

vi.mock("@/lib/services/llm-provider", () => ({
  llm: vi.fn(() => ({ modelId: "mock" })),
  getDefaultModel: vi.fn(() => "mock-model"),
}));

vi.mock("@/lib/services/vector-store", () => ({
  queryPinecone: vi.fn(),
  formatContext: vi.fn(),
}));

vi.mock("@/lib/services/embedding", () => ({
  generateEmbedding: vi.fn(),
}));

import { streamText } from "ai";
import { generateQuiz, isQuotaError } from "@/lib/services/quiz-pipeline";
import { formatContext } from "@/lib/services/vector-store";
import { generateEmbedding } from "@/lib/services/embedding";
import { queryPinecone } from "@/lib/services/vector-store";

const mockedStreamText = vi.mocked(streamText);
const mockedFormatContext = vi.mocked(formatContext);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isQuotaError", () => {
  it("returns true for quota errors", () => {
    expect(isQuotaError(new Error("quota exceeded"))).toBe(true);
    expect(isQuotaError(new Error("API quota"))).toBe(true);
    expect(isQuotaError(new Error("429 Too Many Requests"))).toBe(true);
  });

  it("returns false for non-quota errors", () => {
    expect(isQuotaError(new Error("network error"))).toBe(false);
    expect(isQuotaError(new Error("timeout"))).toBe(false);
  });

  it("returns false for non-Error objects", () => {
    expect(isQuotaError("quota exceeded")).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError({ message: "quota" })).toBe(false);
  });
});

describe("generateQuiz", () => {
  it("calls embedding, vectorStore, and streamText with correct args", async () => {
    const fakeEmbedding = {
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2]),
    };
    const fakeVectorStore = {
      queryPinecone: vi.fn().mockResolvedValue([
        { id: "a", score: 0.9, text: "passage A" },
      ]),
    };
    mockedFormatContext.mockReturnValue("formatted context");

    const fakeResponse = new Response("stream");
    mockedStreamText.mockReturnValue({
      toTextStreamResponse: vi.fn().mockReturnValue(fakeResponse),
    } as never);

    const result = await generateQuiz(
      { topics: ["dhamma", "sacca"], amount: 5 },
      { embedding: fakeEmbedding, vectorStore: fakeVectorStore },
    );

    expect(fakeEmbedding.generateEmbedding).toHaveBeenCalledWith("dhamma, sacca");
    expect(fakeVectorStore.queryPinecone).toHaveBeenCalledWith([0.1, 0.2], 10);
    expect(mockedFormatContext).toHaveBeenCalledWith([
      { id: "a", score: 0.9, text: "passage A" },
    ]);
    expect(mockedStreamText).toHaveBeenCalledOnce();
    expect(result).toBe(fakeResponse);
  });

  it("uses default embedding/vectorStore when no deps provided", async () => {
    vi.mocked(generateEmbedding).mockResolvedValue([0.1]);
    vi.mocked(queryPinecone).mockResolvedValue([]);
    mockedFormatContext.mockReturnValue("");
    mockedStreamText.mockReturnValue({
      toTextStreamResponse: vi.fn().mockReturnValue(new Response("")),
    } as never);

    await generateQuiz({ topics: ["anatta"], amount: 3 });

    expect(generateEmbedding).toHaveBeenCalledWith("anatta");
    expect(queryPinecone).toHaveBeenCalledWith([0.1], 10);
  });
});
