"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, User, X } from "lucide-react";
import { useAIChat, AIMessage, ChatInput } from "@/components/ai";

export function QuestionClient() {
  const [input, setInput] = useState("");
  const { messages, status, error, sendMessage, regenerate, stop, clear } = useAIChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] max-w-4xl mx-auto w-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-fd-muted-foreground p-8">
            <Bot className="size-12 mb-4 opacity-20" />
            <h2 className="text-2xl font-semibold mb-2">
              ฉันจะช่วยอะไรคุณได้บ้างวันนี้?
            </h2>
            <p className="max-w-md">
              ถามอะไรก็ได้เกี่ยวกับเอกสาร Pali ฉันสามารถช่วยค้นหาข้อมูล
              อธิบายแนวคิด และอื่น ๆ ได้
            </p>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex w-full justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex gap-3 max-w-[85%] lg:max-w-[75%] flex-row-reverse">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full border shadow-sm bg-background">
                  <User className="size-4 text-muted-foreground" />
                </div>
                <div className="relative px-5 py-2 shadow-sm bg-primary text-primary-foreground rounded-2xl rounded-tr-sm">
                  {(Array.isArray(m.parts) ? m.parts : [])
                    .filter((p): p is { type: "text"; text: string } => p.type === "text")
                    .map((p, i) => (
                      <span key={i}>{p.text}</span>
                    ))}
                </div>
              </div>
            </div>
          ) : (
            <AIMessage
              key={m.id}
              message={m}
              onSelectSuggestion={(text) => {
                setInput("");
                void sendMessage({ text });
              }}
            />
          ),
        )}
      </div>

      {error && (
        <div className="max-w-4xl mx-auto mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => {
              /* error clears on next send */
            }}
            className="ml-2 text-red-500 hover:text-red-700 dark:hover:text-red-300"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={(text) => {
          setInput("");
          void sendMessage({ text });
        }}
        status={status}
        onStop={stop}
        onRegenerate={regenerate}
        onClear={clear}
        hasMessages={messages.length > 0}
      />
    </div>
  );
}
