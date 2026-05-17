"use client";

import { type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import Link from "fumadocs-core/link";
import { type UIMessage } from "@ai-sdk/react";
import type { ProvideLinksToolSchema } from "@/lib/chat/inkeep-qa-schema";
import type { z } from "zod";
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
  let links: z.infer<typeof ProvideLinksToolSchema>["links"] = [];

  for (const part of message.parts ?? []) {
    if (part.type === "text") {
      markdown += part.text;
      continue;
    }

    if (part.type === "tool-provideLinks" && part.input) {
      links = (part.input as z.infer<typeof ProvideLinksToolSchema>).links;
    }
  }

  return (
    <div {...props}>
      <p
        className={cn(
          "mb-1 text-sm font-medium text-fd-muted-foreground",
          message.role === "assistant" && "text-fd-primary"
        )}
      >
        {`${roleName[message.role]}:` || "unknown"}
      </p>
      <div className="prose text-sm">
        <Markdown text={markdown} />
      </div>
      {links && links.length > 0 ? (
        <div className="mt-2 flex flex-row flex-wrap items-center gap-1">
          {links.map((item, i) => (
            <Link
              key={i}
              href={item.url}
              className="block text-xs rounded-lg border p-3 hover:bg-fd-accent hover:text-fd-accent-foreground"
            >
              <p className="font-medium">{item.title}</p>
              <p className="text-fd-muted-foreground">Reference {item.label}</p>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}