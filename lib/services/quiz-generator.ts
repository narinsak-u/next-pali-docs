import { streamObject } from "ai";
import { openrouter } from "@/lib/services/openrouter-client";
import { quizResponseSchema } from "@/lib/schemas/quiz";

export interface QuizGenerationInput {
  topics: string[];
  amount: number;
  context: string;
}

export async function generateQuizResponse(input: QuizGenerationInput) {
  const result = streamObject({
    model: openrouter(process.env.LLM_MODEL ?? "google/gemma-4-31b-it:free"),
    schema: quizResponseSchema,
    prompt: `
    Using this context as reference: ${input.context}
    Generate ${input.amount} multiple-choice questions about ${input.topics}.
    The questions must be based on the provided context.
    Each question should test understanding of key concepts from the context.

    Make sure each question and its options are directly related to the content provided.
    Ensure all fields are within the word limits.
    Translate all questions, answers, and options to Thai language.
    `,
  });

  return result.toTextStreamResponse();
}
