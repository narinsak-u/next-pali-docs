import { generateEmbedding } from "./embedding";
import {
  queryPinecone,
  formatContext,
  type DocumentMatch,
} from "./vector-store";
import {
  streamText,
  tool,
  stepCountIs,
  createUIMessageStream,
  type InferUIMessageChunk,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { llm, getDefaultModel } from "@/lib/services/llm-provider";

export interface QuizInput {
  topics: string[];
  amount: number;
}

const SEARCH_TASK_LABEL = "ค้นหาเอกสาร";

function buildSystemWithContext(baseSystem: string, context: string): string {
  return `${baseSystem}\n\nContext from Pali textbook corpus:\n${context}\n\nUse this context to generate the questions. Do not search again — you already have the necessary information.`;
}

const MAX_STEPS = 20;

function stopWhenForAmount(amount: number) {
  return stepCountIs(Math.max(MAX_STEPS, Math.ceil(amount / 2) + 5));
}

export function generateQuizStream(
  input: QuizInput,
): ReadableStream<InferUIMessageChunk<UIMessage>> {
  return createUIMessageStream({
    execute: async ({ writer }) => {
      let searchCompleted = false;
      const searchToolCallId = `search-${Date.now()}`;

      writer.write({
        type: "data-status",
        data: { phase: "searching" },
      });

      writer.write({
        type: "data-task",
        data: {
          id: searchToolCallId,
          label: SEARCH_TASK_LABEL,
          status: "running",
          query: input.topics.join(", "),
        },
      });

      let matches: DocumentMatch[] = [];
      try {
        const embedding = await generateEmbedding(input.topics.join(", "));
        matches = await queryPinecone(embedding, 10);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "search failed";
        writer.write({
          type: "data-task",
          data: {
            id: searchToolCallId,
            label: SEARCH_TASK_LABEL,
            status: "error",
            message,
          },
        });
        matches = [];
      }

      if (!searchCompleted) {
        searchCompleted = true;
        writer.write({
          type: "data-task",
          data: {
            id: searchToolCallId,
            label: SEARCH_TASK_LABEL,
            status: "done",
            matchCount: matches.length,
          },
        });
        const excerpts = matches
          .slice(0, 10)
          .map((m) => m.text.slice(0, 120).trim());
        writer.write({
          type: "data-reasoning",
          data: {
            summary: `พบเอกสารที่เกี่ยวข้อง ${matches.length} รายการ`,
            excerpts,
          },
        });
      }

      writer.write({
        type: "data-status",
        data: { phase: "answering" },
      });

      const context = formatContext(matches);

      const result = streamText({
        model: llm(getDefaultModel()),
        system:
          "You are a quiz generator that creates multiple-choice questions based on textbook content. Generate questions one at a time using the submitQuestions tool. Call the tool once per batch of questions.",
        messages: [
          {
            role: "user",
            content: [
              "Using this context as reference:\n",
              context,
              `\nGenerate ${input.amount} multiple-choice questions about ${input.topics.join(", ")}.`,
              "The questions must be based on the provided context.",
              "Each question should test understanding of key concepts.",
              "Make sure each question and its options are directly related to the content.",
              "Translate all questions, answers, and options to Thai language.",
              "",
              "Submit questions in batches using the submitQuestions tool. Each question must have these exact fields:",
              "  question: the question text",
              "  answer: the correct answer (max 15 words)",
              "  option1: wrong option 1 (max 15 words)",
              "  option2: wrong option 2 (max 15 words)",
              "  option3: wrong option 3 (max 15 words)",
            ].join("\n"),
          },
        ],
        tools: {
          submitQuestions: tool({
            description: "Submit one or more quiz questions",
            inputSchema: z.object({
              questions: z
                .array(
                  z.object({
                    question: z.string(),
                    answer: z.string(),
                    option1: z.string(),
                    option2: z.string(),
                    option3: z.string(),
                  }),
                )
                .min(1)
                .describe("Array of quiz questions to submit"),
            }),
            execute: async ({ questions }) => {
              questions.forEach((q, i) => {
                writer.write({
                  type: "data-question",
                  data: {
                    id: `q-${Date.now()}-${i}`,
                    question: q.question,
                    answer: q.answer,
                    option1: q.option1,
                    option2: q.option2,
                    option3: q.option3,
                  },
                });
              });
              return { submitted: questions.length };
            },
          }),
        },
        stopWhen: stopWhenForAmount(input.amount),
        prepareStep: async ({ steps }) => {
          if (steps.length === 0) return undefined;
          return {
            system: buildSystemWithContext(
              "You are a quiz generator that creates multiple-choice questions based on textbook content. Generate questions one at a time using the submitQuestions tool. Call the tool once per batch of questions.",
              context,
            ),
          };
        },
      });

      writer.merge(result.toUIMessageStream({ sendReasoning: false }));
      await result.consumeStream();
    },
  });
}

export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes("quota") || err.message.includes("429");
}
