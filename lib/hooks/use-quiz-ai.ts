"use client";

import { useMemo, useCallback, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

export type QuizPhase = "idle" | "searching" | "generating" | "done" | "error";

export interface QuizQuestion {
  id: string;
  question: string;
  answer: string;
  option1: string;
  option2: string;
  option3: string;
}

export interface UseQuizAIReturn {
  phase: QuizPhase;
  matchCount: number;
  questions: QuizQuestion[];
  error: Error | null;
  messages: UIMessage[];
  status: string;
  submit: (payload: { topics: string[]; amount: number }) => void;
  stop: () => void;
  clear: () => void;
}

function mapErrorToThai(err: Error): string {
  const m = err.message.toLowerCase();
  if (m.includes("quota") || m.includes("429") || m.includes("rate limit")) {
    return "บริการ AI หมดโควต้าการใช้งาน กรุณาลองใหม่อีกครั้งในภายหลัง";
  }
  return "เกิดข้อผิดพลาดในการสร้างแบบทดสอบ กรุณาลองใหม่อีกครั้ง";
}

function deriveState(messages: UIMessage[], status: string, error: Error | undefined) {
  if (error) {
    return { phase: "error" as const, matchCount: 0, questions: [] };
  }

  let matchCount = 0;
  let searchDoneSeen = false;
  const questions: QuizQuestion[] = [];

  for (const m of messages) {
    for (const p of m.parts ?? []) {
      if (p.type === "data-task") {
        const d = p.data as { label: string; status: string; matchCount?: number };
        if (d.label === "ค้นหาเอกสาร" && d.status === "done" && typeof d.matchCount === "number") {
          matchCount = d.matchCount;
          searchDoneSeen = true;
        }
      } else if (p.type === "data-question") {
        const d = p.data as QuizQuestion;
        questions.push(d);
      }
    }
  }

  if (questions.length > 0 || (searchDoneSeen && status === "ready")) {
    return { phase: "done" as const, matchCount, questions };
  }
  if (searchDoneSeen) {
    return { phase: "generating" as const, matchCount, questions: [] };
  }
  return { phase: "searching" as const, matchCount: 0, questions: [] };
}

export function useQuizAI(): UseQuizAIReturn {
  const { messages, status, error, sendMessage, stop, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/quiz" }),
  });

  const requestIdRef = useRef(0);

  const submit = useCallback(
    (payload: { topics: string[]; amount: number }) => {
      requestIdRef.current += 1;
      setMessages([]);
      sendMessage({ text: JSON.stringify(payload) });
    },
    [sendMessage, setMessages],
  );

  const clear = useCallback(() => setMessages([]), [setMessages]);

  const derived = useMemo(
    () => deriveState(messages, status, error ?? undefined),
    [messages, status, error],
  );

  const thaiError = useMemo(
    () => (error ? new Error(mapErrorToThai(error)) : null),
    [error],
  );

  return {
    phase: derived.phase,
    matchCount: derived.matchCount,
    questions: derived.questions,
    error: thaiError,
    messages,
    status: status as string,
    submit,
    stop,
    clear,
  };
}
