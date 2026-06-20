import { pc } from "@/lib/pinecone";

const MODEL = "llama-text-embed-v2";
const CACHE_LIMIT = 100;

const embeddingCache = new Map<string, number[]>();

function getCached(key: string): number[] | undefined {
  const value = embeddingCache.get(key);
  if (value) {
    embeddingCache.delete(key);
    embeddingCache.set(key, value);
  }
  return value;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const cached = getCached(text);
  if (cached) return cached;

  const result = await pc.inference.embed(MODEL, [text], {
    inputType: "passage",
    truncate: "END",
  });
  const values = (result.data[0] as { values: number[] }).values;

  if (embeddingCache.size >= CACHE_LIMIT) {
    const oldest = embeddingCache.keys().next().value;
    if (oldest !== undefined) embeddingCache.delete(oldest);
  }
  embeddingCache.set(text, values);
  return values;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const results: (number[] | undefined)[] = texts.map((t) => getCached(t));
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
      if (embeddingCache.size >= CACHE_LIMIT) {
        const oldest = embeddingCache.keys().next().value;
        if (oldest !== undefined) embeddingCache.delete(oldest);
      }
      embeddingCache.set(text, values);
      results[missingIdx[i]] = values;
    });
  }

  return results as number[][];
}
