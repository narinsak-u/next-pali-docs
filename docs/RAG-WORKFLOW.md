# Chat RAG Workflow

## Overview

The chat endpoint (`POST /api/question`) implements a Retrieval-Augmented Generation (RAG) pipeline for Pali language questions. The LLM uses a `searchDocs` tool to fetch relevant textbook passages from Pinecone, then continues generation with the retrieved context injected into the system prompt. Follow-up question suggestions are generated after the answer is complete.

## Architecture

```
Client ──POST /api/question──→ Route Handler
                                   │
                          createUIMessageStream
                                   │
                            streamText (LLM)
                              │          │
                              │    searchDocs tool
                              │          │
                              │    searchDocuments()
                              │     ├─ generateEmbedding()
                              │     └─ queryPinecone()
                              │          │
                              │    prepareStep()
                              │     └─ inject context into system prompt
                              │          │
                              │    suggestQuestions tool
                              │     └─ follow-up questions to client
                              │
                          consumeStream()
                                   │
                    createUIMessageStreamResponse
                                   │
Client ←── streaming response ────┘
```

## LLM Provider Switching

The chat uses `llm(getDefaultModel())` from `lib/services/llm-provider.ts`, which dynamically selects between providers based on the `PROVIDER_NAME` environment variable:

| Provider | `PROVIDER_NAME` | Base URL | Key Env Vars | Default Model |
|----------|-----------------|----------|--------------|---------------|
| OpenRouter | `openrouter` (default) | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY`, `OPENROUTER_LLM_MODEL` | `google/gemma-3-27b-it:free` |
| OpenCode | `opencode` | `https://opencode.ai/zen/go/v1` | `OPENCODE_API_KEY`, `OPENCODE_LLM_MODEL` | `deepseek-v4-flash` |

Both providers use `createOpenAICompatible` from `@ai-sdk/openai-compatible` under the hood. The `llm()` function creates a configured model instance, and `getDefaultModel()` returns the model name from the appropriate env var.

## Step-by-Step Flow

### 1. Request Handling

- `POST /api/question` receives a JSON body with `{ messages: UIMessage[] }`
- Messages use the AI SDK's `UIMessage` format (parts-based, supports text + tool calls)

### 2. Stream Initialization

`createUIMessageStream` wraps the entire LLM interaction in a controlled streaming session. The `writer` object allows real-time updates (tool status, reasoning, suggestions) alongside the LLM's text output.

### 3. LLM Invocation with Tool Declaration

`streamText` is called with:

| Parameter | Source | Description |
|-----------|--------|-------------|
| `model` | `llm(getDefaultModel())` | Provider-selected model |
| `system` | `PALI_EXPERT_SYSTEM_PROMPT` | Static prompt defining the Pali expert role |
| `messages` | `convertToModelMessages(messages)` | Converts UI messages to model format |
| `stopWhen` | `stepCountIs(5)` | Allows up to 5 tool-calling steps (increased from 2 for DeepSeek compatibility) |
| `tools` | `searchDocs`, `suggestQuestions` | Registered tools for RAG and suggestions |

The system prompt (`lib/chat/pali-system-prompt.ts`) instructs the model:
- Act as a Pali language expert
- Use `searchDocs` for questions answerable from the textbook corpus
- Respond in the user's language (Thai, English, etc.)

### 4. Tool Execution — `searchDocs`

When the LLM decides to search, the `execute` handler runs:

**a. Search deduplication guard:**
```ts
if (searchCompleted && cachedResult) {
  // Return cached results immediately — no duplicate Pinecone calls
  writer.write({
    type: "data-task",
    data: { id: toolCallId, label: "ค้นหาเอกสาร", status: "done", ... },
  });
  return cachedResult;
}
searchCompleted = true;
```
This prevents redundant searches when models (e.g. DeepSeek) call the tool multiple times in the same conversation turn.

**b. Status updates** — Writer sends `data-task` events to the client:
- `running` → UI shows loading state with the query
- `done` → UI shows match count
- `error` → UI shows error message, empty results returned

**c. Embedding generation** (`lib/services/embedding.ts`):
- The search query is embedded using Pinecone's inference API with model `llama-text-embed-v2`
- A simple LRU cache (100 entries) avoids redundant embedding calls

**d. Vector search** (`lib/services/vector-store.ts`):
- The embedding vector is queried against the Pinecone index (`PINECONE_INDEX_NAME`) in namespace `PINECONE_NAMESPACE`
- Returns top 5 matches (`topK`) with `includeMetadata: true`
- Results are filtered to only include documents with non-empty `text` metadata

**e. Formatting** — `formatContext()` concatenates matched document texts with `\n---\n` separators

**f. Reasoning update** — Writer sends `data-reasoning` with a Thai summary: "พบเอกสารที่เกี่ยวข้อง N รายการ" and text excerpts

**g. Task ID nesting** — `toolCallId` is placed inside `data.id` (not at the top `id` level) to match client-side dedup logic in `ai-message.tsx`

### 5. Context Injection — `prepareStep`

After each tool execution step, `prepareStep` checks for `searchDocs` results:

- Iterates all steps and their tool results
- If `searchDocs` returned matches, formats them via `formatContext()` and builds a new system prompt:
  ```
  {PALI_EXPERT_SYSTEM_PROMPT}

  Context from Pali textbook corpus:
  {formatted matches}
  ```
- Returns `{ system: newPrompt }` → this replaces the system prompt for the next LLM step
- If no matches found, returns `undefined` (continues with original prompt)

This is the core RAG mechanism: the LLM first decides what to search for (tool call), then continues generation with the retrieved context available.

### 6. Tool Execution — `suggestQuestions`

After the answer is complete, the LLM may call `suggestQuestions`:

```ts
suggestQuestions: tool({
  inputSchema: z.object({
    suggestions: z.array(z.string().min(1)).min(1).max(3),
  }),
  execute: async ({ suggestions }) => {
    if (suggestionsGenerated) return { ok: false }; // dedup guard
    suggestionsGenerated = true;
    if (suggestions.length === 0) return { ok: false };
    writer.write({
      type: "data-suggestions",
      data: { suggestions },
    });
    return { ok: true };
  },
})
```

### 7. Stream Consumption

- `writer.merge(result.toUIMessageStream({ sendReasoning: false }))` merges the LLM's text + tool call stream into the UI stream
- `result.consumeStream()` waits for full completion

### 8. Response

`createUIMessageStreamResponse` wraps the stream into a proper HTTP Response with streaming headers.

### 9. Error Handling

| Error | Status | Response |
|-------|--------|----------|
| Quota exceeded (429) | 429 | `{ error: "insufficient_quota" }` |
| All other errors | 500 | `{ error: "internal_error" }` |

Non-LLM exceptions (network, Pinecone failures) are caught at the route level.

## Key Files

| File | Role |
|------|------|
| `app/api/question/route.ts` | Route handler, stream orchestration |
| `lib/services/llm-provider.ts` | LLM provider factory (OpenRouter + OpenCode switching) |
| `lib/services/rag-pipeline.ts` | `searchDocuments()` |
| `lib/services/vector-store.ts` | Pinecone query, context formatting |
| `lib/services/embedding.ts` | Embedding generation with LRU cache |
| `lib/chat/pali-system-prompt.ts` | Pali expert role definition |
| `lib/services/suggestions.ts` | Follow-up question generation |

## Streaming Events

| Type | Purpose |
|------|---------|
| `data-task` | Tool status updates (`id` inside `data` for client dedup) |
| `data-reasoning` | Search summary and excerpts for the user |
| `data-suggestions` | Follow-up question suggestions |
| (text) | LLM-generated answer tokens |

## Environment Variables

| Variable | Required | Used By |
|----------|----------|---------|
| `PROVIDER_NAME` | No (default: `openrouter`) | Provider selection |
| `OPENROUTER_API_KEY` / `OPENAI_API_KEY` | If OpenRouter | OpenRouter LLM calls |
| `OPENROUTER_LLM_MODEL` / `LLM_MODEL` | No (has default) | Model selection |
| `OPENCODE_API_KEY` | If OpenCode | OpenCode LLM calls |
| `OPENCODE_LLM_MODEL` | No (has default) | Model selection |
| `PINECONE_API_KEY` | Yes | Vector search |
| `PINECONE_INDEX_NAME` | Yes | Vector search |
| `PINECONE_NAMESPACE` | No | Vector namespace scoping |
