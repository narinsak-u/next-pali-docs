"use client";

import { useCallback, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

export type ChatPhase =
  | "idle"
  | "thinking"
  | "searching"
  | "answering"
  | "done";

export interface UseAIChatReturn {
  messages: ReturnType<typeof useChat>["messages"];
  status: ReturnType<typeof useChat>["status"];
  phase: ChatPhase;
  error: string | null;
  sendMessage: ReturnType<typeof useChat>["sendMessage"];
  regenerate: ReturnType<typeof useChat>["regenerate"];
  stop: ReturnType<typeof useChat>["stop"];
  clear: () => void;
}

function mapErrorToThai(err: Error): string {
  const m = err.message.toLowerCase();
  if (m.includes("quota") || m.includes("429") || m.includes("rate limit")) {
    return "บริการ AI หมดโควต้าการใช้งาน กรุณาลองใหม่อีกครั้งในภายหลัง";
  }
  return "เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง";
}

function derivePhase(messages: UIMessage[], chatStatus: string): ChatPhase {
  if (messages.length === 0) return "idle";

  const last = messages[messages.length - 1];

  if (last.role === "user") {
    return chatStatus === "submitted" || chatStatus === "streaming"
      ? "thinking"
      : "idle";
  }

  // Ground truth: ready = done, input is enabled
  if (chatStatus !== "streaming") return "done";

  // Still streaming — determine phase from parts
  const parts = Array.isArray(last.parts) ? last.parts : [];

  let hasRunningTask = false;
  let statusPhase: string | null = null;

  for (const p of parts) {
    if (p.type === "data-task") {
      if ((p as { data: { status: string } }).data?.status === "running") {
        hasRunningTask = true;
      }
    }
    if (p.type === "data-status") {
      statusPhase = (p as { data: { phase: string } }).data?.phase ?? null;
    }
  }

  if (hasRunningTask) return "searching";
  if (statusPhase === "answering") return "answering";

  return "thinking";
}

export function useAIChat(): UseAIChatReturn {
  const [error, setError] = useState<string | null>(null);
  const { messages, status, sendMessage, regenerate, stop, setMessages } =
    useChat({
      transport: new DefaultChatTransport({ api: "/api/question" }),
      onError: (err) => setError(mapErrorToThai(err)),
    });

  const clear = useCallback(() => setMessages([]), [setMessages]);

  const phase = useMemo(
    () => derivePhase(messages, status),
    [messages, status],
  );

  return {
    messages,
    status,
    phase,
    error,
    sendMessage,
    regenerate,
    stop,
    clear,
  };
}

export { mapErrorToThai };
