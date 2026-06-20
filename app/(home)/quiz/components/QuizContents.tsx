"use client";

import { useQuiz } from "@/hooks/use-quiz";
import HomeState from "../states/HomeState";
import { LoadingOverlay } from "./LoadingOverlay";
import QuizState from "../states/QuizState";
import ResultState from "../states/ResultState";
import Disclaimer from "./Disclaimer";
import { notFound } from "next/navigation";

function getErrorMessage(err: Error | null): string | null {
  if (!err) return null;
  const msg = err.message || "";
  if (msg.includes("quota") || msg.includes("429") || msg.includes("insufficient_quota")) {
    return "บริการ AI หมดโควต้าการใช้งาน กรุณาลองใหม่อีกครั้งในภายหลัง";
  }
  if (msg.includes("Failed to process")) {
    return "เกิดข้อผิดพลาดในการสร้างแบบทดสอบ กรุณาลองใหม่อีกครั้ง";
  }
  return "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง";
}

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
    error,
    startQuiz,
    selectOption,
    goToPage,
    timeUp,
    submitQuiz,
    restartQuiz,
  } = useQuiz();

  const handleRetry = () => {
    if (selectedTopic) {
      startQuiz(selectedTopic);
    }
  };

  if (appState === "home") {
    return <HomeState onStartQuiz={startQuiz} />;
  }

  if (appState === "loading") {
    return <LoadingOverlay onComplete={() => {}} error={getErrorMessage(error)} onRetry={handleRetry} />;
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