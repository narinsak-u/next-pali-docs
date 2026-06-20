"use client";

import { useCallback, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

export interface UseAIChatReturn {
  messages: ReturnType<typeof useChat>["messages"];
  status: ReturnType<typeof useChat>["status"];
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

export function useAIChat(): UseAIChatReturn {
  const [error, setError] = useState<string | null>(null);
  const { messages, status, sendMessage, regenerate, stop, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/question" }),
    onError: (err) => setError(mapErrorToThai(err)),
  });

  const clear = useCallback(() => setMessages([]), [setMessages]);

  return { messages, status, error, sendMessage, regenerate, stop, clear };
}

export { mapErrorToThai };
