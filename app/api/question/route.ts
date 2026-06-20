import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { searchDocuments } from "@/lib/services/rag-pipeline";
import { openrouter } from "@/lib/services/openrouter-client";
import { PALI_EXPERT_SYSTEM_PROMPT } from "@/lib/chat/pali-system-prompt";
import { generateSuggestions } from "@/lib/services/suggestions";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    let lastMatchCount = 0;
    let lastAnswer = "";

    const stream = createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        const result = streamText({
          model: openrouter(process.env.LLM_MODEL ?? "google/gemma-4-31b-it:free"),
          system: PALI_EXPERT_SYSTEM_PROMPT,
          messages: convertToModelMessages(messages),
          tools: {
            searchDocs: tool({
              description:
                "Search the Pali textbook corpus for relevant passages.",
              inputSchema: z.object({ query: z.string().min(1) }),
              execute: async ({ query }, { toolCallId }) => {
                writer.write({
                  type: "data-task",
                  id: toolCallId,
                  data: { label: "ค้นหาเอกสาร", status: "running", query },
                });
                try {
                  const { matches } = await searchDocuments(query);
                  lastMatchCount = matches.length;
                  writer.write({
                    type: "data-task",
                    id: toolCallId,
                    data: {
                      label: "ค้นหาเอกสาร",
                      status: "done",
                      matchCount: matches.length,
                    },
                  });
                  writer.write({
                    type: "data-reasoning",
                    data: {
                      summary: `พบเอกสารที่เกี่ยวข้อง ${matches.length} รายการ`,
                    },
                  });
                  return { matches };
                } catch (e: unknown) {
                  const message =
                    e instanceof Error ? e.message : "search failed";
                  writer.write({
                    type: "data-task",
                    id: toolCallId,
                    data: { label: "ค้นหาเอกสาร", status: "error", message },
                  });
                  lastMatchCount = 0;
                  return { matches: [] };
                }
              },
            }),
          },
        });

        writer.merge(result.toUIMessageStream({ sendReasoning: false }));
        await result.consumeStream();

        lastAnswer = await result.text;

        if (lastMatchCount > 0 && lastAnswer) {
          try {
            const suggestions = await generateSuggestions(lastAnswer);
            writer.write({ type: "data-suggestions", data: { suggestions } });
          } catch {
            // silent skip
          }
        }
      },
    });

    return createUIMessageStreamResponse({ stream }) as unknown as Response;
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
