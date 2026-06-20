import {
  queryPinecone,
  formatContext,
  type DocumentMatch,
} from "./vector-store";
import { generateEmbedding } from "./embedding";
import type { UIMessage } from "ai";

export interface RAGOptions {
  topK?: number;
}

export interface RAGResult {
  context: string;
  matches: DocumentMatch[];
}

// extract text from user messages for RAG processing
// returns the text content of the last user message, or an empty string if none exists
export function extractTextFromMessages(messages: UIMessage[]): string {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return "";

  if (Array.isArray(lastMessage.parts)) {
    return lastMessage.parts.find((p) => p.type === "text")?.text || "";
  }

  if ("content" in lastMessage && typeof lastMessage.content === "string") {
    return lastMessage.content;
  }

  return "";
}

// handles the RAG pipeline:
// - extracts text from messages,
// - generates an embedding (1024-dim),
// - and queries the vector store
export async function runRAG(
  messages: UIMessage[],
  options: RAGOptions = {},
): Promise<RAGResult> {
  const topK = options.topK ?? 5;
  const text = extractTextFromMessages(messages);

  if (!text) {
    return { context: "", matches: [] };
  }

  const embedding = await generateEmbedding(text);
  const matches = await queryPinecone(embedding, topK);
  const context = formatContext(matches);
  console.log(matches, "matches");
  console.log(context, "context");

  return { context, matches };
}
