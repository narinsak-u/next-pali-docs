import { searchService } from "./search";
import { extractTextFromMessages } from "./rag-pipeline";
import type { UIMessage } from "ai";

export interface AlgoliaRAGOptions {
  topK?: number;
}

export interface AlgoliaRAGResult {
  context: string;
  sources: Array<{ title: string; url: string }>;
}

/**
 * Extract the last user message text from a UIMessage array.
 * Re-exports extractTextFromMessages from rag-pipeline for API compatibility.
 */
export function extractQueryFromMessages(messages: UIMessage[]): string {
  return extractTextFromMessages(messages);
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

  const context = searchService.formatAsContext(results);

  const sources = results.map((r) => ({
    title: r.title,
    url: r.url,
  }));

  return { context, sources };
}
