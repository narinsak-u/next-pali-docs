# Design: Algolia RAG with OpenCode Zen (Big Pickle)

**Date:** 2026-05-17
**Status:** Draft
**Author:** opencode

## Problem Statement

The `/api/question` endpoint currently uses Pinecone vector search + OpenAI embeddings for retrieval and OpenAI gpt-4o-mini for generation. When OpenAI quota is exceeded, the endpoint returns 500 errors. The goal is to implement a new RAG pipeline using Algolia (already configured) for retrieval and OpenCode Zen's free "Big Pickle" model for generation, without touching the existing Pinecone-based code.

## Architecture

### Overview

A new `/api/ai` endpoint replaces the current `/api/question` as the primary AI chat endpoint. The old `/api/question` route and all Pinecone-related code remain untouched.

```
User question → /api/ai POST
  → Algolia search (via existing searchService)
  → Format top 5 hits as context string
  → streamText({ model: zen("big-pickle"), system: context + prompt })
  → Stream response back to UI
```

### Components

#### 1. New Service: `lib/services/algolia-rag.ts`

- **Purpose:** Algolia-based retrieval and context formatting
- **Dependencies:** `lib/services/search.ts` (existing Algolia search service)
- **Interface:**
  - `runAlgoliaRAG(query: string, options?: AlgoliaRAGOptions): Promise<AlgoliaRAGResult>`
  - `AlgoliaRAGOptions`: `{ topK?: number }` (default: 5)
  - `AlgoliaRAGResult`: `{ context: string, sources: Array<{ title: string, url: string }> }`
- **Behavior:**
  - Returns empty result if query is empty
  - Searches Algolia with the query
  - Formats results as "Title: ...\nContent: ..." joined by "---"
  - Returns source metadata (title + url) for potential citation display

#### 2. New Route: `app/api/ai/route.ts`

- **Purpose:** AI chat endpoint using Algolia RAG + Zen Big Pickle
- **Runtime:** Node.js (maxDuration: 30)
- **Dependencies:**
  - `@ai-sdk/openai-compatible` for Zen API
  - `@/lib/services/algolia-rag` for retrieval
  - `ai` package for streaming
- **Configuration:**
  - Zen base URL: `https://opencode.ai/zen/v1`
  - Model: `big-pickle`
  - API key from `ZEN_API_KEY` env var
- **Error handling:**
  - 429 for quota/billing errors with Thai message
  - 500 for other errors with Thai message
  - Follows same pattern as existing `/api/question` error handling

#### 3. Updated Component: `app/(home)/question/QuestionClient.tsx`

- **Change:** Update `DefaultChatTransport` API from `/api/question` to `/api/ai`
- **No other changes:** Error handling already implemented in previous commit

### Files Untouched

- `app/api/question/route.ts` — Pinecone RAG stays as-is
- `lib/services/rag-pipeline.ts` — Pinecone RAG pipeline stays as-is
- `lib/services/vector-store.ts` — Pinecone client stays as-is
- `lib/services/embedding.ts` — OpenAI embedding stays as-is
- `lib/services/quiz-pipeline.ts` — Quiz continues using Pinecone
- All quiz-related files — no changes

### Data Flow

1. User types question in `/question` page
2. `QuestionClient` sends POST to `/api/ai` with UIMessage array
3. Route extracts last message text as query
4. `runAlgoliaRAG` searches Algolia, returns formatted context
5. Route calls `streamText` with Zen Big Pickle model + system prompt containing context
6. Response streams back to client via `toUIMessageStreamResponse()`
7. UI renders streaming response in chat bubbles

### Error Handling

- API route wraps entire handler in try/catch
- Quota errors (429) return Thai message: "บริการ AI หมดโควต้าการใช้งาน..."
- Other errors (500) return Thai message: "เกิดข้อผิดพลาดในการเชื่อมต่อ..."
- Client-side `onError` callback and error banner already exist in QuestionClient

### Environment Variables

- **New:** `ZEN_API_KEY` — OpenCode Zen API key (from opencode.ai/auth)
- **Existing (still used by quiz):** `OPENAI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `ALGOLIA_*`

### Trade-offs

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Retrieval | Algolia | Already configured, no embedding dependency |
| Generation | Big Pickle (Zen) | Free during beta, OpenAI-compatible |
| Endpoint | New `/api/ai` | Keeps `/api/question` as fallback |
| Pinecone code | Untouched | Quiz still uses it, no breaking changes |

### Privacy Note

Big Pickle is a free model during its limited-time period. Collected data may be used to improve the model. Do not submit personal or confidential data through this endpoint.
