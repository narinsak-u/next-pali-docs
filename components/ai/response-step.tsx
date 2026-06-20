import { cn } from "@/lib/utils";

export function ResponseStep({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  return (
    <div
      data-testid="response-step"
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none rounded-2xl rounded-tl-sm border bg-card px-4 py-3 text-card-foreground shadow-sm",
      )}
    >
      {text}
      {isStreaming && <span className="ml-0.5 inline-block w-1.5 h-4 align-text-bottom bg-current animate-pulse" />}
    </div>
  );
}
