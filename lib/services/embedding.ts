import { LRUCache } from "lru-cache";
import { pc } from "@/lib/pinecone";

const MODEL = "llama-text-embed-v2";
const CACHE_LIMIT = 100;
const CACHE_TTL_MS = 1000 * 60 * 60;

const embeddingCache = new LRUCache<string, number[]>({
  max: CACHE_LIMIT,
  ttl: CACHE_TTL_MS,
});

export async function generateEmbedding(text: string): Promise<number[]> {
  const cached = embeddingCache.get(text);
  if (cached) return cached;

  const result = await pc.inference.embed(MODEL, [text], {
    inputType: "passage",
    truncate: "END",
  });
  const values = (result.data[0] as { values: number[] }).values;
  embeddingCache.set(text, values);
  return values;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const results: (number[] | undefined)[] = texts.map((t) => embeddingCache.get(t));
  const missingIdx: number[] = [];
  const missingTexts: string[] = [];
  results.forEach((r, i) => {
    if (!r) {
      missingIdx.push(i);
      missingTexts.push(texts[i]);
    }
  });

  if (missingTexts.length > 0) {
    const response = await pc.inference.embed(MODEL, missingTexts, {
      inputType: "passage",
      truncate: "END",
    });
    response.data.forEach((d, i) => {
      const values = (d as { values: number[] }).values;
      const text = missingTexts[i];
      embeddingCache.set(text, values);
      results[missingIdx[i]] = values;
    });
  }

  return results as number[][];
}
