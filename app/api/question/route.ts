import { convertToModelMessages, streamText, UIMessage } from "ai";
import { runRAG } from "@/lib/services/rag-pipeline";
import { openrouter } from "@/lib/services/openrouter-client";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();
    const { context } = await runRAG(messages);

    const result = streamText({
      model: openrouter(process.env.LLM_MODEL ?? "google/gemma-4-31b-it:free"),
      system: `
        You are a Pali language expert. Your responses should be informative yet concise,
        focusing on accurate Pali language knowledge based on context.

        When answering questions, prioritize clarity and brevity while maintaining accuracy.
        If a question is outside the scope of the textbook content, kindly indicate that.

        IMPORTANT: Your responses must never exceed 100 words.

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
