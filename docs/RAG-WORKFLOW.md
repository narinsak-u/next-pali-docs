# Chat RAG Workflow

## Overview

The chat endpoint (`POST /api/question`) implements a Retrieval-Augmented Generation (RAG) pipeline for Pali language questions. The LLM uses a `searchDocs` tool to fetch relevant textbook passages from Pinecone, then continues generation with the retrieved context injected into the system prompt.

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
                              │
                          consumeStream()
                              │
                    generateSuggestions()
                                   │
                    createUIMessageStreamResponse
                                   │
Client ←── streaming response ────┘
```

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
| `model` | `openrouter(LLM_MODEL)` | Default: `google/gemma-4-31b-it:free` |
| `system` | `PALI_EXPERT_SYSTEM_PROMPT` | Static prompt defining the Pali expert role |
| `messages` | `convertToModelMessages(messages)` | Converts UI messages to model format |
| `tools` | `searchDocs` | Registered tool for RAG retrieval |

The system prompt (`lib/chat/pali-system-prompt.ts`) instructs the model:
- Act as a Pali language expert
- Use `searchDocs` for questions answerable from the textbook corpus
- Respond in the user's language (Thai, English, etc.)

### 4. Tool Execution — `searchDocs`

When the LLM decides to search, the `execute` handler runs:

**a. Status updates** — Writer sends `data-task` events to the client:
- `running` → UI shows loading state with the query
- `done` → UI shows match count
- `error` → UI shows error message, empty results returned

**b. Embedding generation** (`lib/services/embedding.ts`):
- The search query is embedded using Pinecone's inference API with model `llama-text-embed-v2`
- A simple LRU cache (100 entries) avoids redundant embedding calls

**c. Vector search** (`lib/services/vector-store.ts`):
- The embedding vector is queried against the Pinecone index (`PINECONE_INDEX_NAME`) in namespace `PINECONE_NAMESPACE`
- Returns top 5 matches (`topK`) with `includeMetadata: true`
- Results are filtered to only include documents with non-empty `text` metadata

**d. Formatting** — `formatContext()` concatenates matched document texts with `\n---\n` separators

**e. Reasoning update** — Writer sends `data-reasoning` with a Thai summary: "พบเอกสารที่เกี่ยวข้อง N รายการ"

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

### 6. Stream Consumption

- `result.toUIMessageStream()` merges the LLM's text + tool call stream into the UI stream
- `result.consumeStream()` waits for full completion
- `result.text` captures the final answer text

### 7. Follow-up Suggestions

If documents were found (`lastMatchCount > 0`) and an answer was generated:

- `generateSuggestions(lastAnswer)` calls a separate LLM with structured output (Zod schema `suggestions: z.array(z.string().min(1)).length(3)`)
- The suggestion model receives: "Generate exactly 3 follow-up questions in the same language as the user's last message. Keep them short, focused, and grounded in the previous answer."
- Results are sent as a `data-suggestions` event to the client
- Failures are silently skipped

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
| `lib/services/rag-pipeline.ts` | `searchDocuments()`, `runRAG()` |
| `lib/services/vector-store.ts` | Pinecone query, context formatting |
| `lib/services/embedding.ts` | Embedding generation with LRU cache |
| `lib/services/openrouter-client.ts` | OpenRouter-compatible LLM client |
| `lib/chat/pali-system-prompt.ts` | Pali expert role definition |
| `lib/services/suggestions.ts` | Follow-up question generation |
| `lib/pinecone.ts` | Pinecone client singleton |

## Streaming Events

| Type | Purpose |
|------|---------|
| `data-task` | Tool status updates (running/done/error) |
| `data-reasoning` | Search summary for the user |
| `data-suggestions` | Follow-up question suggestions |
| (text) | LLM-generated answer tokens |

## Environment Variables

| Variable | Required | Used By |
|----------|----------|---------|
| `OPENAI_API_KEY` (as `PROVIDER_API_KEY`) | Yes | OpenRouter LLM calls |
| `LLM_MODEL` | No (has default) | Model selection |
| `PINECONE_API_KEY` | Yes | Vector search |
| `PINECONE_INDEX_NAME` | Yes | Vector search |
| `PINECONE_NAMESPACE` | No | Vector namespace scoping |
