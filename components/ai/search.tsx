"use client";

import { createContext, use, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  type DialogProps,
  DialogTitle,
} from "@radix-ui/react-dialog";
import { type UIMessage, useChat, type UseChatHelpers } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChatInput } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";
import { ChatActions } from "./ChatActions";

const ChatContext = createContext<UseChatHelpers<UIMessage> | null>(null);
export function useChatContext() {
  return use(ChatContext)!;
}

function List({ children }: { children: ReactNode }) {
  return (
    <div
      className="fd-scroll-container overflow-y-auto max-h-[calc(100dvh-240px)] min-w-0 flex flex-col"
      style={{
        maskImage:
          "linear-gradient(to bottom, transparent, black 20px, black calc(100% - 20px), transparent)",
      }}
    >
      <div className="flex flex-col gap-4 p-3">{children}</div>
    </div>
  );
}

export default function AISearch(props: DialogProps) {
  const chat = useChat({
    id: "search",
    transport: new DefaultChatTransport({
      api: "/api/question",
    }),
  });

  const messages = chat.messages.filter((msg) => msg.role !== "system");

  return (
    <Dialog {...props}>
      {props.children}
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 backdrop-blur-xs data-[state=closed]:animate-fd-fade-out data-[state=open]:animate-fd-fade-in" />
        <DialogContent
          onOpenAutoFocus={(e) => {
            document.getElementById("nd-ai-input")?.focus();
            e.preventDefault();
          }}
          aria-describedby={undefined}
          className="fixed flex flex-col w-[calc(100%-1rem)] bg-fd-popover/80 backdrop-blur-xl p-1 rounded-2xl shadow-2xl border max-md:top-12 md:bottom-12 left-1/2 z-50 max-w-screen-sm -translate-x-1/2 focus-visible:outline-none data-[state=open]:animate-fd-dialog-in data-[state=closed]:animate-fd-dialog-out"
        >
          <ChatContext value={chat}>
            <div className="px-3 py-2">
              <DialogTitle className="text-sm font-medium">
                AI-Powered Search
              </DialogTitle>
              <DialogDescription className="text-xs text-fd-muted-foreground">
                AI can be inaccurate, please verify the information.
              </DialogDescription>
            </div>
            <DialogClose
              aria-label="Close"
              tabIndex={-1}
              className={cn(
                buttonVariants({
                  size: "sm",
                  variant: "ghost",
                  className: "absolute top-1 end-1 text-fd-muted-foreground",
                })
              )}
            >
              <X />
            </DialogClose>

            {messages.length > 0 && (
              <List>
                {messages.map((item) => (
                  <ChatMessage key={item.id} message={item} />
                ))}
              </List>
            )}
            <div className="rounded-xl overflow-hidden border border-fd-foreground/20 text-fd-popover-foreground">
              <ChatInput />
              <ChatActions className="flex flex-row items-center gap-1.5 p-1 empty:hidden" />
            </div>
          </ChatContext>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}