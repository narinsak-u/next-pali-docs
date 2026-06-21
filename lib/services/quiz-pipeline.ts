import { generateEmbedding } from "./embedding";
import {
  queryPinecone,
  formatContext,
  type DocumentMatch,
} from "./vector-store";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { llm, getDefaultModel } from "@/lib/services/llm-provider";

export interface QuizInput {
  topics: string[];
  amount: number;
}

function encodeSSE(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

export async function generateQuizStream(
  input: QuizInput,
): Promise<ReadableStream> {
  return new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encodeSSE(event, data));
      }

      try {
        // Phase 1: Retrieve relevant textbook context from Pinecone
        const embeddingResult = await generateEmbedding(
          input.topics.join(", "),
        );
        const matches = await queryPinecone(embeddingResult, 10);
        const context = formatContext(matches);

        // Tell the client search is done so it can transition from searching → generating
        send("search-done", { matchCount: matches.length });

        let totalSubmitted = 0;

        // Phase 2: Stream quiz questions via LLM — each question emitted via SSE as it's generated
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
                // Emit each question as an SSE event so the client renders it immediately
                for (const q of questions) {
                  totalSubmitted++;
                  send("question", q);
                }
                return {
                  submitted: questions.length,
                  remaining: input.amount - totalSubmitted,
                };
              },
            }),
          },
          stopWhen: stepCountIs(Math.max(15, Math.ceil(input.amount / 2) + 3)),
        });

        await result.consumeStream();

        send("done", { total: totalSubmitted });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });
}

export interface EmbeddingPort {
  generateEmbedding(text: string): Promise<number[]>;
}

export interface VectorStorePort {
  queryPinecone(embedding: number[], topK: number): Promise<DocumentMatch[]>;
}

const defaultEmbedding: EmbeddingPort = {
  generateEmbedding,
};

const defaultVectorStore: VectorStorePort = {
  async queryPinecone(embedding, topK) {
    return queryPinecone(embedding, topK);
  },
};

export async function generateQuiz(
  input: QuizInput,
  deps: { embedding?: EmbeddingPort; vectorStore?: VectorStorePort } = {},
): Promise<Response> {
  const embedding = deps.embedding ?? defaultEmbedding;
  const vectorStore = deps.vectorStore ?? defaultVectorStore;

  const embeddingResult = await embedding.generateEmbedding(
    input.topics.join(", "),
  );
  const matches = await vectorStore.queryPinecone(embeddingResult, 10);
  const context = formatContext(matches);

  const result = streamText({
    model: llm(getDefaultModel()),
    system:
      "You are a quiz generator. Call submitQuestions tool with batches of questions.",
    messages: [
      {
        role: "user",
        content: [
          "Using this context as reference:\n",
          context,
          `\nGenerate ${input.amount} multiple-choice questions about ${input.topics.join(", ")}.`,
          "Translate all questions, answers, and options to Thai language.",
          "",
          "Submit questions using the submitQuestions tool.",
        ].join("\n"),
      },
    ],
    tools: {
      submitQuestions: tool({
        description: "Submit quiz questions",
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
            .min(1),
        }),
        execute: async ({ questions }) => ({
          submitted: questions.length,
        }),
      }),
    },
    stopWhen: stepCountIs(Math.max(10, Math.ceil(input.amount / 2) + 3)),
  });

  return result.toTextStreamResponse();
}

export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes("quota") || err.message.includes("429");
}
