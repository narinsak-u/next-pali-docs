"use client";

import { useEffect, useCallback } from "react";
import { quizTopics } from "@/data/quiz-topic";
import { mapQuestionsFromResponse } from "@/helpers/map-questions";
import type { Question } from "@/lib/schemas/quiz";

import { useQuizFlow } from "@/lib/hooks/use-quiz-flow";
import { useQuizData } from "@/lib/hooks/use-quiz-data";
import { useQuizUI } from "@/lib/hooks/use-quiz-ui";
import { useQuizAI } from "@/lib/hooks/use-quiz-ai";
import { useQuizStats } from "@/lib/hooks/use-quiz-stats";

interface UseQuizReturn {
  appState: "home" | "loading" | "quiz" | "results";
  selectedTopic: string | null;
  questions: Question[];
  currentPage: number;
  answers: Record<string, string>;
  quizCompleted: boolean;
  timeExpired: boolean;
  isLoading: boolean;
  error: Error | null;
  object: import("@/lib/schemas/quiz").QuizResponse | undefined;
  allQuestionsAnswered: boolean;
  answeredQuestionsCount: number;
  progressPercentage: number;
  score: { correct: number; total: number; percentage: number };
  startQuiz: (topicId: string) => Promise<void>;
  selectOption: (questionId: string, optionId: string) => void;
  goToPage: (page: number) => void;
  timeUp: () => void;
  submitQuiz: () => void;
  restartQuiz: () => void;
}

export function useQuiz(): UseQuizReturn {
  const flow = useQuizFlow();
  const data = useQuizData();
  const ui = useQuizUI();
  const ai = useQuizAI();
  const { stats } = useQuizStats(data.questions, data.answers);

  const startQuiz = useCallback(
    async (topicId: string) => {
      const topic = quizTopics.find((t) => t.id === topicId);
      if (!topic) {
        console.error("Topic not found");
        return;
      }

      data.setTopic(topicId);
      flow.start();
      ui.reset();
      data.clearAnswers();

      ai.submit({
        amount: topic.amount,
        topics: topic.keywords,
      });
    },
    [ai, data, flow, ui]
  );

  const selectOption = useCallback(
    (questionId: string, optionId: string) => {
      data.answer(questionId, optionId);
    },
    [data]
  );

  const goToPage = useCallback(
    (page: number) => {
      ui.setPage(page);
    },
    [ui]
  );

  const timeUp = useCallback(() => {
    ui.markExpired();

    const updatedAnswers = { ...data.answers };
    data.questions.forEach((q) => {
      if (!updatedAnswers[q.id]) {
        updatedAnswers[q.id] = "time-expired";
      }
    });

    Object.keys(updatedAnswers).forEach((key) => {
      data.answer(key, updatedAnswers[key]);
    });

    ui.markComplete();
    flow.goToResults();
  }, [data, flow, ui]);

  const submitQuiz = useCallback(() => {
    ui.markComplete();
    flow.goToResults();
  }, [flow, ui]);

  const restartQuiz = useCallback(() => {
    flow.goToHome();
    data.setTopic(null);
    data.setQuestions([]);
    ui.reset();
    data.clearAnswers();
  }, [data, flow, ui]);

  useEffect(() => {
    if (ai.object?.questions) {
      const mappedQuestions = mapQuestionsFromResponse(ai.object.questions);
      data.setQuestions(mappedQuestions);
      flow.goToQuiz();
    }
  }, [ai.object, ai.isLoading, data, flow]);

  useEffect(() => {
    if (flow.appState === "quiz" || flow.appState === "results") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [ui.currentPage, flow.appState]);

  return {
    appState: flow.appState,
    selectedTopic: data.selectedTopic,
    questions: data.questions,
    currentPage: ui.currentPage,
    answers: data.answers,
    quizCompleted: ui.completed,
    timeExpired: ui.timeExpired,
    isLoading: ai.isLoading,
    error: ai.error,
    object: ai.object,
    allQuestionsAnswered: stats.allQuestionsAnswered,
    answeredQuestionsCount: stats.answeredQuestionsCount,
    progressPercentage: stats.progressPercentage,
    score: stats.score,
    startQuiz,
    selectOption,
    goToPage,
    timeUp,
    submitQuiz,
    restartQuiz,
  };
}