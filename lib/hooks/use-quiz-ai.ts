"use client";

import { useReducer, useRef, useCallback } from "react";

type QuizPhase = "idle" | "searching" | "generating" | "done" | "error";

interface QuizQuestion {
  question: string;
  answer: string;
  option1: string;
  option2: string;
  option3: string;
}

type QuizAiState = {
  phase: QuizPhase;
  matchCount: number;
  questions: QuizQuestion[];
  error: Error | null;
};

type QuizAiAction =
  | { type: "RESET" }
  | { type: "SET_MATCHES"; count: number }
  | { type: "SET_QUESTIONS"; questions: QuizQuestion[] }
  | { type: "APPEND_QUESTIONS"; questions: QuizQuestion[] }
  | { type: "SET_PHASE"; phase: QuizPhase }
  | { type: "SET_ERROR"; error: Error | null };

const initialQuizAiState: QuizAiState = {
  phase: "idle",
  matchCount: 0,
  questions: [],
  error: null,
};

function quizAiReducer(state: QuizAiState, action: QuizAiAction): QuizAiState {
  switch (action.type) {
    case "RESET":
      return initialQuizAiState;
    case "SET_MATCHES":
      return { ...state, matchCount: action.count };
    case "SET_QUESTIONS":
      return { ...state, questions: action.questions };
    case "APPEND_QUESTIONS":
      return { ...state, questions: [...state.questions, ...action.questions] };
    case "SET_PHASE":
      return { ...state, phase: action.phase };
    case "SET_ERROR":
      return { ...state, error: action.error };
  }
}

interface UseQuizAIReturn {
  phase: QuizPhase;
  matchCount: number;
  questions: QuizQuestion[];
  error: Error | null;
  submit: (payload: { topics: string[]; amount: number }) => void;
}

export function useQuizAI(): UseQuizAIReturn {
  const [state, dispatch] = useReducer(quizAiReducer, initialQuizAiState);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const submit = useCallback(
    async (payload: { topics: string[]; amount: number }) => {
      const reqId = ++requestIdRef.current;
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      dispatch({ type: "RESET" });
      dispatch({ type: "SET_PHASE", phase: "searching" });

      try {
        const response = await fetch("/api/quiz", {
          method: "POST",
          body: JSON.stringify(payload),
          signal: abort.signal,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(
            (body as Record<string, unknown>)?.error as string ||
              `Server error: ${response.status}`,
          );
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          if (requestIdRef.current !== reqId) break;

          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const events = parseSSE(buffer);
          buffer = events.remainder;

          for (const { event, data } of events.parsed) {
            if (requestIdRef.current !== reqId) break;
            switch (event) {
              case "search-done":
                dispatch({ type: "SET_MATCHES", count: getNum(data, "matchCount") });
                dispatch({ type: "SET_PHASE", phase: "generating" });
                break;
              case "question":
                dispatch({
                  type: "APPEND_QUESTIONS",
                  questions: [
                    {
                      question: getStr(data, "question"),
                      answer: getStr(data, "answer"),
                      option1: getStr(data, "option1"),
                      option2: getStr(data, "option2"),
                      option3: getStr(data, "option3"),
                    },
                  ],
                });
                break;
              case "done":
                dispatch({ type: "SET_PHASE", phase: "done" });
                break;
              case "error":
                throw new Error(getStr(data, "message") || "Generation failed");
            }
          }
        }
      } catch (err: unknown) {
        if (requestIdRef.current !== reqId) return;
        if (err instanceof Error && err.name === "AbortError") return;
        dispatch({
          type: "SET_ERROR",
          error: err instanceof Error ? err : new Error("Unknown error"),
        });
        dispatch({ type: "SET_PHASE", phase: "error" });
      }
    },
    [],
  );

  return {
    phase: state.phase,
    matchCount: state.matchCount,
    questions: state.questions,
    error: state.error,
    submit,
  };
}

interface ParsedEvent {
  event: string;
  data: Record<string, unknown>;
}

function parseSSE(text: string): {
  parsed: ParsedEvent[];
  remainder: string;
} {
  const parsed: ParsedEvent[] = [];
  let remainder = text;

  const regex = /event: (.+)\ndata: (.+)\n\n/;
  while (true) {
    const m = regex.exec(remainder);
    if (!m) break;
    try {
      parsed.push({
        event: m[1],
        data: JSON.parse(m[2]) as Record<string, unknown>,
      });
    } catch {
      // skip unparseable events
    }
    remainder = remainder.slice(m.index + m[0].length);
  }

  return { parsed, remainder };
}

function getNum(data: Record<string, unknown>, key: string): number {
  const v = data[key];
  return typeof v === "number" ? v : 0;
}

function getStr(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === "string" ? v : "";
}
