"use client";

import { type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { type UIMessage } from "@ai-sdk/react";
import { Markdown } from "./markdown";

const roleName: Record<string, string> = {
  user: "you",
  assistant: "palidocs",
};

export function ChatMessage({
  message,
  ...props
}: { message: UIMessage } & ComponentProps<"div">) {
  let markdown = "";

  for (const part of message.parts ?? []) {
    if (part.type === "text") {
      markdown += part.text;
    }
  }

  return (
    <div {...props}>
      <p
        className={cn(
          "mb-1 text-sm font-medium text-fd-muted-foreground",
          message.role === "assistant" && "text-fd-primary",
        )}
      >
        {`${roleName[message.role]}:` || "unknown"}
      </p>
      <div className="prose text-sm">
        <Markdown text={markdown} />
      </div>
    </div>
  );
}
