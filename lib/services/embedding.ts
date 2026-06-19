import { pc } from "@/lib/pinecone";

const MODEL = "llama-text-embed-v2";

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await pc.inference.embed(MODEL, [text], {
    inputType: "passage",
    truncate: "END",
  });
  return (result.data[0] as { values: number[] }).values;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const result = await pc.inference.embed(MODEL, texts, {
    inputType: "passage",
    truncate: "END",
  });
  return result.data.map((d) => (d as { values: number[] }).values);
}
