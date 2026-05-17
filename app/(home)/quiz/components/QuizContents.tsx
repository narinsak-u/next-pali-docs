"use client";

import { useQuiz } from "@/hooks/use-quiz";
import HomeState from "../states/HomeState";
import { LoadingOverlay } from "./LoadingOverlay";
import QuizState from "../states/QuizState";
import ResultState from "../states/ResultState";
import Disclaimer from "./Disclaimer";
import { notFound } from "next/navigation";

export default function QuizContents() {
  const {
    appState,
    selectedTopic,
    questions,
    currentPage,
    answers,
    quizCompleted,
    timeExpired,
    isLoading,
    object,
    allQuestionsAnswered,
    answeredQuestionsCount,
    progressPercentage,
    score,
    startQuiz,
    selectOption,
    goToPage,
    timeUp,
    submitQuiz,
    restartQuiz,
  } = useQuiz();

  if (appState === "home") {
    return <HomeState onStartQuiz={startQuiz} />;
  }

  if (appState === "loading") {
    return <LoadingOverlay onComplete={() => {}} />;
  }

  if (appState === "quiz") {
    return (
      <>
        <QuizState
          selectedTopic={selectedTopic}
          currentPage={currentPage}
          setCurrentPage={goToPage}
          questions={questions}
          object={object}
          answers={answers}
          quizCompleted={quizCompleted}
          timeExpired={timeExpired}
          isLoading={isLoading}
          handleTimeUp={timeUp}
          handleSelectOption={selectOption}
          handleSubmitQuiz={submitQuiz}
          allQuestionsAnswered={allQuestionsAnswered}
          answeredQuestionsCount={answeredQuestionsCount}
          progressPercentage={progressPercentage}
        />
        <Disclaimer />
      </>
    );
  }

  if (appState === "results") {
    return (
      <>
        <ResultState
          selectedTopic={selectedTopic}
          score={score}
          questions={questions}
          handleRestartQuiz={restartQuiz}
          answers={answers}
        />
        <Disclaimer />
      </>
    );
  }

  notFound();
}