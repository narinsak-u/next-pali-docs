# Algolia RAG with OpenCode Zen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new `/api/ai` endpoint using Algolia for retrieval and OpenCode Zen's free Big Pickle model for generation, replacing `/api/question` as the primary AI chat endpoint.

**Architecture:** New Algolia-based RAG service feeds context to Big Pickle (free via Zen) for streaming responses. Old Pinecone-based `/api/question` route and all related code remain untouched.

**Tech Stack:** Next.js 15 App Router, `@ai-sdk/openai-compatible`, `@ai-sdk/react`, Algolia, TypeScript

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/services/algolia-rag.ts` | Create | Algolia retrieval + context formatting |
| `app/api/ai/route.ts` | Create | AI chat endpoint with Zen Big Pickle |
| `app/(home)/question/QuestionClient.tsx` | Modify | Point to `/api/ai` instead of `/api/question` |

---

### Task 1: Create Algolia RAG Service

**Files:**
- Create: `lib/services/algolia-rag.ts`

- [ ] **Step 1: Write the service module**

Create `lib/services/algolia-rag.ts`:

```typescript
import { searchService } from "./search";

export interface AlgoliaRAGOptions {
  topK?: number;
}

export interface AlgoliaRAGResult {
  context: string;
  sources: Array<{ title: string; url: string }>;
}

export function extractQueryFromMessages(messages: unknown[]): string {
  const lastMessage = messages?.[messages.length - 1];
  if (!lastMessage) return "";

  // Handle UIMessage format with parts array
  if (
    typeof lastMessage === "object" &&
    lastMessage !== null &&
    "parts" in lastMessage &&
    Array.isArray((lastMessage as { parts: unknown[] }).parts)
  ) {
    const textPart = (lastMessage as { parts: unknown[] }).parts.find(
      (p) => typeof p === "object" && p !== null && (p as { type?: string }).type === "text",
    );
    if (textPart && typeof textPart === "object" && "text" in textPart) {
      return (textPart as { text: string }).text || "";
    }
  }

  // Handle UIMessage format with content string
  if (
    typeof lastMessage === "object" &&
    lastMessage !== null &&
    "content" in lastMessage &&
    typeof (lastMessage as { content: unknown }).content === "string"
  ) {
    return (lastMessage as { content: string }).content;
  }

  return "";
}

export async function runAlgoliaRAG(
  query: string,
  options: AlgoliaRAGOptions = {},
): Promise<AlgoliaRAGResult> {
  const topK = options.topK ?? 5;

  if (!query) {
    return { context: "", sources: [] };
  }

  const results = await searchService.search({
    query,
    hitsPerPage: topK,
  });

  const context = results
    .map((r) => `Title: ${r.title}\nContent: ${r.content}`)
    .join("\n---\n");

  const sources = results.map((r) => ({
    title: r.title,
    url: r.url,
  }));

  return { context, sources };
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Commit**

```bash
git add lib/services/algolia-rag.ts
git commit -m "feat: add Algolia-based RAG service for Zen AI endpoint"
```

---

### Task 2: Create `/api/ai` Route

**Files:**
- Create: `app/api/ai/route.ts`

- [ ] **Step 1: Write the API route**

Create `app/api/ai/route.ts`:

```typescript
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, streamText, UIMessage } from "ai";
import { runAlgoliaRAG, extractQueryFromMessages } from "@/lib/services/algolia-rag";

export const maxDuration = 30;

const zen = createOpenAICompatible({
  name: "zen",
  baseURL: "https://opencode.ai/zen/v1",
  apiKey: process.env.ZEN_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();
    const query = extractQueryFromMessages(messages);

    const { context } = await runAlgoliaRAG(query);

    const result = streamText({
      model: zen("big-pickle"),
      system: `You are a helpful assistant that answers questions about the Pali language. Use the context provided to answer the question. If the context does not provide the answer, say "I don't know".

Context:
${context}`,
      messages: convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
  } catch (error: unknown) {
    console.error("AI API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("quota") || message.includes("429")) {
      return new Response(
        JSON.stringify({
          error: "insufficient_quota",
          message: "บริการ AI หมดโควต้าการใช้งาน",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ error: "internal_error", message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/route.ts
git commit -m "feat: add /api/ai endpoint with Zen Big Pickle and Algolia RAG"
```

---

### Task 3: Update QuestionClient to Use `/api/ai`

**Files:**
- Modify: `app/(home)/question/QuestionClient.tsx:17`

- [ ] **Step 1: Change the API endpoint**

In `app/(home)/question/QuestionClient.tsx`, line 17, change:

```typescript
// Before:
api: "/api/question",

// After:
api: "/api/ai",
```

The full `useChat` block becomes:

```typescript
const { messages, stop, setMessages, status, sendMessage, regenerate } =
  useChat({
    transport: new DefaultChatTransport({
      api: "/api/ai",
    }),
    onError: (err) => {
      console.error("Chat error:", err);
      if (err?.message?.includes("quota") || err?.message?.includes("429")) {
        setError(
          "บริการ AI หมดโควต้าการใช้งาน กรุณาลองใหม่อีกครั้งในภายหลัง",
        );
      } else {
        setError("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง");
      }
    },
  });
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Commit**

```bash
git add app/\(home\)/question/QuestionClient.tsx
git commit -m "feat: switch question page to use /api/ai endpoint"
```

---

## Post-Implementation

After all tasks are complete, verify:
1. `npm run build` passes cleanly
2. Old `/api/question` route still exists and is untouched
3. `lib/services/rag-pipeline.ts`, `lib/services/vector-store.ts`, `lib/services/embedding.ts` are all untouched
4. Quiz pipeline continues to work (uses Pinecone, unchanged)

## Environment Variables

User must set `ZEN_API_KEY` in their `.env.local` (get from opencode.ai/auth) before the `/api/ai` endpoint will work.
