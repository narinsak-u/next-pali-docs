import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { searchDocuments } from "@/lib/services/rag-pipeline";
import { openrouter } from "@/lib/services/openrouter-client";
import { PALI_EXPERT_SYSTEM_PROMPT } from "@/lib/chat/pali-system-prompt";
import { formatContext, type DocumentMatch } from "@/lib/services/vector-store";

export const runtime = "nodejs";
export const maxDuration = 120;

function buildSystemWithContext(baseSystem: string, context: string): string {
  return `${baseSystem}\n\nContext from Pali textbook corpus:\n${context}`;
}

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const stream = createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        let suggestionsGenerated = false;

        const result = streamText({
          model: openrouter(
            process.env.LLM_MODEL ?? "google/gemma-4-31b-it:free",
          ),
          system: PALI_EXPERT_SYSTEM_PROMPT,
          messages: convertToModelMessages(messages),
          stopWhen: stepCountIs(2),
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
                  writer.write({
                    type: "data-task",
                    id: toolCallId,
                    data: {
                      label: "ค้นหาเอกสาร",
                      status: "done",
                      matchCount: matches.length,
                    },
                  });
                  const excerpts = matches.map((m) =>
                    m.text.slice(0, 120).trim(),
                  );
                  writer.write({
                    type: "data-reasoning",
                    data: {
                      summary: `พบเอกสารที่เกี่ยวข้อง ${matches.length} รายการ`,
                      excerpts,
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
                  return { matches: [] };
                }
              },
            }),
            suggestQuestions: tool({
              description:
                "Generate 3 follow-up questions for the user based on the conversation.",
              inputSchema: z.object({
                suggestions: z.array(z.string().min(1)).min(1).max(3),
              }),
              execute: async ({ suggestions }) => {
                if (suggestionsGenerated) return { ok: false };
                suggestionsGenerated = true;
                if (suggestions.length === 0) return { ok: false };
                writer.write({
                  type: "data-suggestions",
                  data: { suggestions },
                });
                return { ok: true };
              },
            }),
          },
          prepareStep: async ({ steps }) => {
            for (const step of steps) {
              for (const tr of step.toolResults) {
                if (
                  tr.toolName === "searchDocs" &&
                  tr.output &&
                  typeof tr.output === "object" &&
                  "matches" in tr.output
                ) {
                  const matches = (tr.output as { matches: DocumentMatch[] })
                    .matches;
                  if (matches.length > 0) {
                    const context = formatContext(matches);
                    return {
                      system: buildSystemWithContext(
                        PALI_EXPERT_SYSTEM_PROMPT,
                        context,
                      ),
                    };
                  }
                }
              }
            }
            return undefined;
          },
        });

        writer.merge(result.toUIMessageStream({ sendReasoning: false }));
        await result.consumeStream();
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
