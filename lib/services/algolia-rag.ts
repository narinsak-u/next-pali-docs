import { searchService } from "./search";

export interface AlgoliaRAGOptions {
  topK?: number;
}

export interface AlgoliaRAGResult {
  context: string;
  sources: Array<{ title: string; url: string }>;
}

export function extractQueryFromMessages(messages: unknown[]): string {
  const lastMessage = messages?.[messages.length - 1];
  if (!lastMessage) return "";

  // Handle UIMessage format with parts array
  if (
    typeof lastMessage === "object" &&
    lastMessage !== null &&
    "parts" in lastMessage &&
    Array.isArray((lastMessage as { parts: unknown[] }).parts)
  ) {
    const textPart = (lastMessage as { parts: unknown[] }).parts.find(
      (p) => typeof p === "object" && p !== null && (p as { type?: string }).type === "text",
    );
    if (textPart && typeof textPart === "object" && "text" in textPart) {
      return (textPart as { text: string }).text || "";
    }
  }

  // Handle UIMessage format with content string
  if (
    typeof lastMessage === "object" &&
    lastMessage !== null &&
    "content" in lastMessage &&
    typeof (lastMessage as { content: unknown }).content === "string"
  ) {
    return (lastMessage as { content: string }).content;
  }

  return "";
}

export async function runAlgoliaRAG(
  query: string,
  options: AlgoliaRAGOptions = {},
): Promise<AlgoliaRAGResult> {
  const topK = options.topK ?? 5;

  if (!query) {
    return { context: "", sources: [] };
  }

  const results = await searchService.search({
    query,
    hitsPerPage: topK,
  });

  const context = results
    .map((r) => `Title: ${r.title}\nContent: ${r.content}`)
    .join("\n---\n");

  const sources = results.map((r) => ({
    title: r.title,
    url: r.url,
  }));

  return { context, sources };
}
