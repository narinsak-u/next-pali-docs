import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, UIMessage } from "ai";
import { runRAG } from "@/lib/services/rag-pipeline";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
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
  } catch (error: unknown) {
    console.error("Question API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("quota") || message.includes("429")) {
      return new Response(
        JSON.stringify({
          error: "insufficient_quota",
          message: "You exceeded your current quota",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ error: "internal_error", message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
