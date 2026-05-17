import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, streamText, UIMessage } from "ai";
import { runAlgoliaRAG, extractQueryFromMessages } from "@/lib/services/algolia-rag";

export const maxDuration = 30;

const zen = createOpenAICompatible({
  name: "zen",
  baseURL: "https://opencode.ai/zen/v1",
  apiKey: process.env.ZEN_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();
    const query = extractQueryFromMessages(messages);

    const { context } = await runAlgoliaRAG(query);

    const result = streamText({
      model: zen("big-pickle"),
      system: `You are a helpful assistant that answers questions about the Pali language. Use the context provided to answer the question. If the context does not provide the answer, say "I don't know".

Context:
${context}`,
      messages: convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
  } catch (error: unknown) {
    console.error("AI API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (
      message.includes("quota") ||
      message.includes("429") ||
      message.includes("Rate limit") ||
      message.includes("FreeUsageLimit")
    ) {
      return new Response(
        JSON.stringify({
          error: "insufficient_quota",
          message: "บริการ AI หมดโควต้าการใช้งาน",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ error: "internal_error", message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
