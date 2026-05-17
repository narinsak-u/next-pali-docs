"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { quizTopics } from "@/data/quiz-topic";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { quizResponeseSchema, type QuizResponse } from "@/lib/schemas/quiz";
import { mapQuestionsFromResponse } from "@/helpers/map-questions";
import { getStats } from "@/helpers/get-stats";
import type { Question } from "@/lib/schemas/quiz";

type AppState = "home" | "loading" | "quiz" | "results";

interface UseQuizReturn {
  appState: AppState;
  selectedTopic: string | null;
  questions: Question[];
  currentPage: number;
  answers: Record<string, string>;
  quizCompleted: boolean;
  timeExpired: boolean;
  isLoading: boolean;
  error: Error | null;
  object: QuizResponse | undefined;
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
  const [appState, setAppState] = useState<AppState>("home");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [timeExpired, setTimeExpired] = useState(false);

  const { object, submit, isLoading, error } = useObject({
    api: "/api/quiz",
    schema: quizResponeseSchema,
  });

  const resetQuizState = useCallback(() => {
    setAnswers({});
    setCurrentPage(1);
    setQuizCompleted(false);
    setTimeExpired(false);
  }, []);

  const stats = useMemo(() => getStats(questions, answers), [questions, answers]);

  const startQuiz = useCallback(
    async (topicId: string) => {
      const topic = quizTopics.find((t) => t.id === topicId);
      if (!topic) {
        console.error("Topic not found");
        return;
      }

      setSelectedTopic(topicId);
      setAppState("loading");
      resetQuizState();

      submit({
        amount: topic.amount,
        topics: topic.keywords,
      });
    },
    [submit, resetQuizState]
  );

  const selectOption = useCallback((questionId: string, optionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
  }, []);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const timeUp = useCallback(() => {
    setTimeExpired(true);

    const updatedAnswers = { ...answers };
    questions.forEach((q) => {
      if (!updatedAnswers[q.id]) {
        updatedAnswers[q.id] = "time-expired";
      }
    });

    setAnswers(updatedAnswers);
    setQuizCompleted(true);
    setAppState("results");
  }, [answers, questions]);

  const submitQuiz = useCallback(() => {
    setQuizCompleted(true);
    setAppState("results");
  }, []);

  const restartQuiz = useCallback(() => {
    setAppState("home");
    setSelectedTopic(null);
    setQuestions([]);
    resetQuizState();
  }, [resetQuizState]);

  useEffect(() => {
    if (object?.questions && !isLoading) {
      const mappedQuestions = mapQuestionsFromResponse(object.questions);
      setQuestions(mappedQuestions);
      setAppState("quiz");
    }
  }, [object, isLoading]);

  useEffect(() => {
    if (appState === "quiz" || appState === "results") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentPage, appState]);

  return {
    appState,
    selectedTopic,
    questions,
    currentPage,
    answers,
    quizCompleted,
    timeExpired,
    isLoading,
    error: error ?? null,
object: object as QuizResponse | undefined,
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