"use client";

import { useState, useCallback } from "react";
import type { Question } from "@/lib/schemas/quiz";

interface UseQuizDataReturn {
  selectedTopic: string | null;
  questions: Question[];
  answers: Record<string, string>;
  setTopic: (topicId: string | null) => void;
  setQuestions: (qs: Question[]) => void;
  answer: (questionId: string, optionId: string) => void;
  clearAnswers: () => void;
}

export function useQuizData(): UseQuizDataReturn {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const setTopic = useCallback((topicId: string | null) => {
    setSelectedTopic(topicId);
  }, []);

  const setQuestionsHandler = useCallback((qs: Question[]) => {
    setQuestions(qs);
  }, []);

  const answer = useCallback((questionId: string, optionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
  }, []);

  const clearAnswers = useCallback(() => {
    setAnswers({});
  }, []);

  return {
    selectedTopic,
    questions,
    answers,
    setTopic,
    setQuestions: setQuestionsHandler,
    answer,
    clearAnswers,
  };
}