import { streamObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { quizResponeseSchema } from "@/lib/schemas/quiz";

export interface QuizGenerationInput {
  topics: string[];
  amount: number;
  context: string;
}

export async function* generateQuiz({
  topics,
  amount,
  context,
}: QuizGenerationInput) {
  const result = streamObject({
    model: openai("gpt-4o-mini"),
    schema: quizResponeseSchema,
    prompt: `
    Using this context as reference: ${context}
    Generate ${amount} multiple-choice questions about ${topics}.
    The questions must be based on the provided context.
    Each question should test understanding of key concepts from the context.

    Make sure each question and its options are directly related to the content provided.
    Ensure all fields are within the word limits.
    Translate all questions, answers, and options to Thai language.
    `,
  });

  return result.toTextStreamResponse();
}

export async function generateQuizResponse(input: QuizGenerationInput) {
  const result = streamObject({
    model: openai("gpt-4o-mini"),
    schema: quizResponeseSchema,
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