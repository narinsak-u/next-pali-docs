import { streamObject } from "ai";
import { llm, getDefaultModel } from "@/lib/services/llm-provider";
import { quizResponseSchema } from "@/lib/schemas/quiz";

export interface QuizGenerationInput {
  topics: string[];
  amount: number;
  context: string;
}

export async function generateQuizResponse(input: QuizGenerationInput) {
  const result = streamObject({
    model: llm(getDefaultModel()),
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
