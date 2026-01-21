"use client";

import { useChat } from "@ai-sdk/react";
// import { Markdown } from "@/components/ai/markdown";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Loader2, RefreshCw, Send, User, Bot, Trash2 } from "lucide-react";
import { useRef, useEffect, useState, type ComponentProps } from "react";
import { DefaultChatTransport } from "ai";

export function QuestionClient() {
  const [input, setInput] = useState('');
  const { messages, stop, setMessages, status, sendMessage, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/question',
    }),
  });
  // console.log(status);

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
            <h2 className="text-2xl font-semibold mb-2">ฉันจะช่วยอะไรคุณได้บ้างวันนี้?</h2>
            <p className="max-w-md">
              ถามอะไรก็ได้เกี่ยวกับเอกสาร Pali ฉันสามารถช่วยค้นหาข้อมูล อธิบายแนวคิด และอื่น ๆ ได้
            </p>
          </div>
        )}
        {/* 
        {status === "streaming" && messages[messages.length - 1]?.role === "assistant" && (
          <div className="flex justify-start w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex gap-3 max-w-[85%] lg:max-w-[75%] flex-row">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full border shadow-sm bg-primary text-primary-foreground">
                <Bot className="size-4" />
              </div>
              <div className="relative px-5 py-3.5 shadow-sm bg-card border text-card-foreground rounded-2xl rounded-tl-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  <span className="text-sm">กำลังคิด...</span>
                </div>
              </div>
            </div>
          </div>
        )} */}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
              m.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "flex gap-3 max-w-[85%] lg:max-w-[75%]",
                m.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border shadow-sm",
                  m.role === "user"
                    ? "bg-background"
                    : "bg-primary text-primary-foreground"
                )}
              >
                {m.role === "user" ? (
                  <User className="size-4 text-muted-foreground" />
                ) : (
                  <Bot className="size-4" />
                )}
              </div>
              <div
                className={cn(
                  "relative px-5 py-2 shadow-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm"
                    : "bg-card border text-card-foreground rounded-2xl rounded-tl-sm"
                )}
              >
                <div className="prose prose-sm dark:prose-invert break-words max-w-none">
                  {
                    m.parts?.map((part, index) =>
                      part.type === "text" ? (
                        <span key={index}>{part.text}</span>
                      ) : null
                    )
                  }
                </div>
              </div>
            </div>
          </div>
        ))}


      </div>

      <div className="p-4  bg-fd-background/50 backdrop-blur-sm sticky bottom-0 z-10">
        <div className="max-w-4xl mx-auto relative flex flex-col gap-2">
          {messages.length > 0 && status === "ready" && (
            <div className="flex justify-center gap-2 mb-2">
              <button
                onClick={() => regenerate()}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2 rounded-full")}
              >
                <RefreshCw className="size-3" />
                Regenerate
              </button>
              <button
                onClick={() => setMessages([])}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2 rounded-full")}
              >
                <Trash2 className="size-3" />
                Clear
              </button>
            </div>
          )}

          <form onSubmit={(e) => {
            e.preventDefault();

            if (input.trim()) {
              sendMessage({ text: input });
              setInput('');
            }
          }} className="relative flex items-center justify-center gap-2">
            <TextareaInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={status !== 'ready'}
              placeholder={status === "streaming" ? "กำลังคิด..." : "ถามคำถาม..."}
              className="pr-12 min-h-[52px] max-h-[200px]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage({ text: input });
                  setInput('');
                }
              }}
            />
            <div className="">
              {status === "streaming" ? (
                <button
                  type="button"
                  onClick={() => stop()}
                  className={cn(buttonVariants({ size: "icon", variant: "ghost" }), "h-8 w-8 rounded-full")}
                >
                  <Loader2 className="size-4 animate-spin" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={status !== "ready"}
                  className={cn(buttonVariants({ size: "icon", variant: "default" }), "h-8 w-8 rounded-full")}
                >
                  <Send className="size-4" />
                </button>
              )}
            </div>
          </form>
          <p className="text-xs text-center text-fd-muted-foreground mt-2">
            AI can make mistakes. Please check important information.
          </p>
        </div>
      </div>
    </div>
  );
}

function TextareaInput(props: ComponentProps<"textarea">) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "inherit";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [props.value]);

  return (
    <textarea
      ref={textareaRef}
      {...props}
      className={cn(
        "flex w-full rounded-2xl border border-fd-input bg-fd-background px-4 py-3 text-sm ring-offset-fd-background placeholder:text-fd-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden",
        props.className
      )}
    />
  );
}
