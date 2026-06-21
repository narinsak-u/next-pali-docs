import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/pinecone", () => ({
  getIndex: vi.fn(),
}));

import { queryPinecone, formatContext, type DocumentMatch } from "@/lib/services/vector-store";
import { getIndex } from "@/lib/pinecone";

const mockedGetIndex = vi.mocked(getIndex);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("formatContext", () => {
  it("returns empty string for empty matches", () => {
    expect(formatContext([])).toBe("");
  });

  it("returns single match text with no separator", () => {
    const matches: DocumentMatch[] = [
      { id: "1", score: 0.9, text: "passage one" },
    ];
    expect(formatContext(matches)).toBe("passage one");
  });

  it("joins multiple matches with triple-dash separator", () => {
    const matches: DocumentMatch[] = [
      { id: "1", score: 0.9, text: "passage one" },
      { id: "2", score: 0.8, text: "passage two" },
    ];
    expect(formatContext(matches)).toBe("passage one\n---\npassage two");
  });
});

describe("queryPinecone", () => {
  it("returns empty array when no matches returned", async () => {
    const mockQuery = vi.fn().mockResolvedValue({ matches: [] });
    const mockNamespace = vi.fn().mockReturnValue({ query: mockQuery });
    mockedGetIndex.mockResolvedValue({ namespace: mockNamespace } as never);

    const result = await queryPinecone([0.1, 0.2], 5);

    expect(mockedGetIndex).toHaveBeenCalledTimes(1);
    expect(mockNamespace).toHaveBeenCalledWith("");
    expect(mockQuery).toHaveBeenCalledWith({
      vector: [0.1, 0.2],
      topK: 5,
      includeMetadata: true,
    });
    expect(result).toEqual([]);
  });

  it("maps and filters results correctly", async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      matches: [
        { id: "a", score: 0.95, metadata: { text: "text A" } },
        { id: "b", score: 0.85, metadata: { text: "text B" } },
        { id: "c", score: 0.0, metadata: { text: "" } },
      ],
    });
    const mockNamespace = vi.fn().mockReturnValue({ query: mockQuery });
    mockedGetIndex.mockResolvedValue({ namespace: mockNamespace } as never);

    const result = await queryPinecone([0.1], 3);

    expect(result).toEqual([
      { id: "a", score: 0.95, text: "text A" },
      { id: "b", score: 0.85, text: "text B" },
      // id "c" is filtered out because text is empty
    ]);
  });

  it("handles missing metadata gracefully", async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      matches: [
        { id: "a", metadata: null },
      ],
    });
    const mockNamespace = vi.fn().mockReturnValue({ query: mockQuery });
    mockedGetIndex.mockResolvedValue({ namespace: mockNamespace } as never);

    const result = await queryPinecone([0.1], 5);

    expect(result).toEqual([]);
  });
});
