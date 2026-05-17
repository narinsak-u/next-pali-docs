"use client";

import { experimental_useObject as useObject } from "@ai-sdk/react";
import { quizResponseSchema, type QuizResponse } from "@/lib/schemas/quiz";

interface UseQuizAIReturn {
  object: QuizResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  submit: (payload: { topics: string[]; amount: number }) => void;
}

export function useQuizAI(): UseQuizAIReturn {
  const { object, submit, isLoading, error } = useObject({
    api: "/api/quiz",
    schema: quizResponseSchema,
  });

  return {
    object: object as QuizResponse | undefined,
    isLoading,
    error: error ?? null,
    submit,
  };
}