import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  queryPinecone,
  formatContext,
  type DocumentMatch,
} from "./vector-store";
import type { UIMessage } from "ai";

export interface RAGOptions {
  topK?: number;
  embeddingModel?: string;
  embeddingDimensions?: number;
}

export interface RAGResult {
  context: string;
  matches: DocumentMatch[];
}

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

export async function runRAG(
  messages: UIMessage[],
  options: RAGOptions = {},
): Promise<RAGResult> {
  const topK = options.topK ?? 10;
  const embeddingModel = options.embeddingModel ?? "text-embedding-3-small";
  const embeddingDimensions = options.embeddingDimensions ?? 1536;

  const text = extractTextFromMessages(messages);

  if (!text) {
    return { context: "", matches: [] };
  }

  const { embedding } = await embed({
    model: openai.embedding(embeddingModel),
    value: text,
    providerOptions: {
      openai: {
        dimensions: embeddingDimensions,
      },
    },
  });

  const matches = await queryPinecone(embedding, topK);
  const context = formatContext(matches);

  return { context, matches };
}
