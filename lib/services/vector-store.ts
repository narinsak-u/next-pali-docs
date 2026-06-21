import { index } from "@/lib/pinecone";

export interface DocumentMatch {
  id: string;
  score: number;
  text: string;
}

const namespace = process.env.PINECONE_NAMESPACE ?? "";

export async function queryPinecone(
  embedding: number[],
  topK: number = 10
): Promise<DocumentMatch[]> {
  const results = await index.namespace(namespace).query({
    vector: embedding,
    topK,
    includeMetadata: true,
  });

  return results.matches
    .map((match) => ({
      id: match.id,
      score: match.score ?? 0,
      text: match.metadata?.text as string ?? "",
    }))
    .filter((doc) => doc.text);
}

export function formatContext(matches: DocumentMatch[]): string {
  return matches.map((match) => match.text).join("\n---\n");
}