import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/embedding", () => ({
  generateEmbedding: vi.fn(),
}));
vi.mock("@/lib/services/vector-store", () => ({
  queryPinecone: vi.fn(),
  formatContext: vi.fn((m: unknown[]) => `ctx(${m.length})`),
}));

import { searchDocuments, runRAG } from "@/lib/services/rag-pipeline";
import { generateEmbedding } from "@/lib/services/embedding";
import { queryPinecone } from "@/lib/services/vector-store";
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
