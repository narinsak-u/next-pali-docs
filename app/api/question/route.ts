import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, UIMessage } from "ai";
import { runRAG } from "@/lib/services/rag-pipeline";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const { context } = await runRAG(messages);

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: `You are a helpful assistant that answers questions about the Pali language. Use the context provided to answer the question. If the context does not provide the answer, say "I don't know".

        Context:
        ${context}`,
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
