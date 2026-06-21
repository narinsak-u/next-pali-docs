import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/pinecone", () => ({
  pc: { inference: { embed: vi.fn() } },
}));

import { generateEmbedding, generateEmbeddings } from "@/lib/services/embedding";
import { pc } from "@/lib/pinecone";

const mockedEmbed = vi.mocked(pc.inference.embed);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateEmbedding", () => {
  it("calls pc.inference.embed on cache miss", async () => {
    mockedEmbed.mockResolvedValue({
      data: [{ values: [0.1, 0.2, 0.3] }],
    } as never);

    const result = await generateEmbedding("miss-1");

    expect(mockedEmbed).toHaveBeenCalledTimes(1);
    expect(mockedEmbed).toHaveBeenCalledWith("llama-text-embed-v2", ["miss-1"], {
      inputType: "passage",
      truncate: "END",
    });
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("returns cached result on repeat call without calling embed again", async () => {
    mockedEmbed.mockResolvedValue({
      data: [{ values: [0.5] }],
    } as never);

    const first = await generateEmbedding("repeat-key");
    const second = await generateEmbedding("repeat-key");

    expect(mockedEmbed).toHaveBeenCalledTimes(1);
    expect(first).toEqual([0.5]);
    expect(second).toEqual(first);
  });

  it("calls embed again for different text", async () => {
    mockedEmbed.mockResolvedValue({
      data: [{ values: [1.0] }],
    } as never);

    await generateEmbedding("diff-a");
    await generateEmbedding("diff-b");
    await generateEmbedding("diff-c");

    expect(mockedEmbed).toHaveBeenCalledTimes(3);
  });

  it("handles the cache LRU by re-calling embed after 100 unique texts", async () => {
    const texts = Array.from({ length: 101 }, (_, i) => `text-${i}`);
    mockedEmbed.mockResolvedValue({
      data: [{ values: [0.5] }],
    } as never);

    for (const t of texts) {
      await generateEmbedding(t);
    }

    // First text should be evicted, call generates a new one
    await generateEmbedding("text-0");

    // 101 calls for the unique texts + 1 for the re-call of evicted text
    expect(mockedEmbed).toHaveBeenCalledTimes(102);
  });
});

describe("generateEmbeddings", () => {
  it("calls embed only for uncached texts (batch)", async () => {
    mockedEmbed.mockResolvedValue({
      data: [{ values: [0.2] }, { values: [0.3] }],
    } as never);

    // Prime cache with one text
    await generateEmbedding("cached-one");

    // Batch: one cached, two missing
    const results = await generateEmbeddings([
      "cached-one",
      "missing-one",
      "missing-two",
    ]);

    // 1 (prime) + 1 (batch call for 2 missing texts)
    expect(mockedEmbed).toHaveBeenCalledTimes(2);
    expect(results).toEqual([[0.2], [0.2], [0.3]]);
  });

  it("calls embed once for all texts when cache is empty", async () => {
    mockedEmbed.mockResolvedValue({
      data: [{ values: [1.0] }, { values: [2.0] }],
    } as never);

    const results = await generateEmbeddings(["a", "b"]);

    expect(mockedEmbed).toHaveBeenCalledTimes(1);
    expect(mockedEmbed).toHaveBeenCalledWith("llama-text-embed-v2", ["a", "b"], {
      inputType: "passage",
      truncate: "END",
    });
    expect(results).toEqual([[1.0], [2.0]]);
  });
});
