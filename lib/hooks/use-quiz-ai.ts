"use client";

import { useState, useCallback, useRef } from "react";

type QuizPhase = "idle" | "searching" | "generating" | "done" | "error";

interface QuizQuestion {
  question: string;
  answer: string;
  option1: string;
  option2: string;
  option3: string;
}

interface UseQuizAIReturn {
  phase: QuizPhase;
  matchCount: number;
  questions: QuizQuestion[];
  error: Error | null;
  submit: (payload: { topics: string[]; amount: number }) => void;
}

export function useQuizAI(): UseQuizAIReturn {
  const [phase, setPhase] = useState<QuizPhase>("idle");
  const [matchCount, setMatchCount] = useState(0);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const submit = useCallback(
    async (payload: { topics: string[]; amount: number }) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      setPhase("searching");
      setQuestions([]);
      setMatchCount(0);
      setError(null);

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
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const events = parseSSE(buffer);
          buffer = events.remainder;

          for (const { event, data } of events.parsed) {
            switch (event) {
              case "search-done":
                setMatchCount(getNum(data, "matchCount"));
                setPhase("generating");
                break;
              case "question":
                setQuestions((prev) => [
                  ...prev,
                  {
                    question: getStr(data, "question"),
                    answer: getStr(data, "answer"),
                    option1: getStr(data, "option1"),
                    option2: getStr(data, "option2"),
                    option3: getStr(data, "option3"),
                  },
                ]);
                break;
              case "done":
                setPhase("done");
                break;
              case "error":
                throw new Error(getStr(data, "message") || "Generation failed");
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err : new Error("Unknown error"));
        setPhase("error");
      }
    },
    [],
  );

  return {
    phase,
    matchCount,
    questions,
    error,
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
