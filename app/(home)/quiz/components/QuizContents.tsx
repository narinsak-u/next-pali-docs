"use client";

import { useEffect, useState } from "react";
import { quizTopics } from "@/data/quiz-topic";
import { LoadingOverlay } from "./LoadingOverlay";
import { getStats } from "@/helpers/get-stats";
import HomeState from "../states/HomeState";
import Disclaimer from "./Disclaimer";
import QuizState from "../states/QuizState";
import ResultState from "../states/ResultState";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { QuizResponse, quizResponeseSchema } from "@/lib/schemas/quiz";
import { mapQuestionsFromResponse } from "@/helpers/map-questions";
import { notFound } from "next/navigation";

export interface Question {
  id: string;
  questionText: string;
  options: {
    id: string;
    text: string;
  }[];
  answerId: string;
}

type AppState = "home" | "loading" | "quiz" | "results";

const Highlights = () => {
  const [appState, setAppState] = useState<AppState>("home");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [timeExpired, setTimeExpired] = useState(false);

  const { object, submit, isLoading, stop, error } = useObject({
    api: "/api/quiz",
    schema: quizResponeseSchema,
  });

  // console.log(object, "object");

  const handleStartQuiz = async (topicId: string) => {
    setSelectedTopic(topicId);
    setAppState("loading");

    // get quiz topic
    const topic = quizTopics.find((topic) => topic.id === topicId);

    if (!topic) {
      console.error("Topic not found");
      return;
    }

    submit({
      amount: topic.amount,
      topics: topic.keywords,
    });

    if (error) {
      console.error("Error generating questions:", error);
      return;
    }

    resetQuizState();
  };

  const resetQuizState = () => {
    setAnswers({});
    setCurrentPage(1);
    setQuizCompleted(false);
    setTimeExpired(false);
  };

  const handleLoadingComplete = () => setAppState("quiz");

  const handleSelectOption = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
  };

  // Quiz statistics
  const {
    allQuestionsAnswered,
    answeredQuestionsCount,
    progressPercentage,
    score,
  } = getStats(questions, answers);

  const handleTimeUp = () => {
    setTimeExpired(true);

    // Mark all unanswered questions as wrong with a special value
    const updatedAnswers = { ...answers };

    questions.forEach((question) => {
      if (!updatedAnswers[question.id]) {
        // Use a special value to indicate time expired (not user selected)
        updatedAnswers[question.id] = "time-expired";
      }
    });

    setAnswers(updatedAnswers);
    handleSubmitQuiz();
  };

  const handleSubmitQuiz = () => {
    // if (!allQuestionsAnswered && !timeExpired) return;
    setQuizCompleted(true);
    setAppState("results");
  };

  const handleRestartQuiz = () => {
    setAppState("home");
    setSelectedTopic(null);
    setQuestions([]);
  };

  // Handle question data when received
  useEffect(() => {
    if (object?.questions && !isLoading) {
      const mappedQuestions = mapQuestionsFromResponse(object.questions);
      setQuestions(mappedQuestions);
      setAppState("quiz");
    }
  }, [object, isLoading]);

  // Scroll to top when changing pages
  useEffect(() => {
    if (appState === "quiz" || appState === "results") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentPage, appState]);

  // # Home State
  if (appState === "home") {
    return <HomeState onStartQuiz={handleStartQuiz} />;
  }

  // # Loading State
  if (appState === "loading") {
    return <LoadingOverlay onComplete={handleLoadingComplete} />;
  }

  // # Quiz State
  if (appState === "quiz") {
    return (
      <>
        <QuizState
          selectedTopic={selectedTopic}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          questions={questions}
          object={object as QuizResponse}
          answers={answers}
          quizCompleted={quizCompleted}
          timeExpired={timeExpired}
          isLoading={isLoading}
          handleTimeUp={handleTimeUp}
          handleSelectOption={handleSelectOption}
          handleSubmitQuiz={handleSubmitQuiz}
          allQuestionsAnswered={allQuestionsAnswered}
          answeredQuestionsCount={answeredQuestionsCount}
          progressPercentage={progressPercentage}
        />
        <Disclaimer />
      </>
    );
  }

  // # Result State
  if (appState === "results") {
    return (
      <>
        <ResultState
          selectedTopic={selectedTopic}
          score={score}
          questions={questions}
          handleRestartQuiz={handleRestartQuiz}
          answers={answers}
        />
        <Disclaimer />
      </>
    );
  }

  // handle fallback
  if (!appState) {
    notFound();
  }
};

export default Highlights;
