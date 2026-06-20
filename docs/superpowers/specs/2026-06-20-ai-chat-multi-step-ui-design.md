# AI Chat UI Redesign with Multi-Step Process Visibility

**Date:** 2026-06-20
**Status:** Approved
**Author:** Brainstorming session

## Problem

The current AI chat at `app/(home)/question` is a single streaming answer
backed by `runRAG`. It is hard to tell what the AI is doing — was a search
run? On what? Did the answer come from the docs or from general knowledge?
Users get no follow-up prompts and no signal of the AI's process.

We want to make the chat more reliable and reasonable by exposing the
underlying steps (Reasoning, Task, Response, Suggestion) as first-class UI
elements, and to adopt the visual language of MUI Treasury's AI elements
without taking on a Material UI dependency.

## Goals

- Surface each AI process step as a distinct, visible UI element.
- Make the AI's actions observable and testable (real tool calls, not faked).
- Match the rest of the Thai-language chat UI.
- Keep the diff focused on the chat surface. Do not touch the quiz AI or
  `components/ai/page-actions.tsx` (unrelated doc-page actions).

## Non-Goals (YAGNI)

- Persistent chat history.
- Authentication / multi-user state.
- Multi-modal input, voice I/O.
- Mobile-specific redesign (timeline stacks gracefully on narrow screens).
- New env vars, new services, model selection UI.
- I18n beyond Thai / English.

## Design Summary

A multi-step backend (AI SDK `createUIMessageStream` + one tool + a
follow-up generator) emits typed data parts. The client renders each part
as a step on a color-coded vertical timeline rail, with the main answer as
the always-present `Response` step. The visual language follows MUI
Treasury's AI element kit, re-implemented in our Radix + Tailwind stack.

## Architecture

### Backend — `app/api/question/route.ts`

Refactor from a single `streamText` call to:

```ts
import { createUIMessageStream, createUIMessageStreamResponse, streamText, tool, convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import { searchDocuments } from "@/lib/services/rag-pipeline";
import { generateSuggestions } from "@/lib/services/suggestions";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      const result = streamText({
        model: openrouter(process.env.LLM_MODEL ?? "google/gemma-4-31b-it:free"),
        system: PALI_EXPERT_SYSTEM_PROMPT,
        messages: convertToModelMessages(messages),
        tools: {
          searchDocs: tool({
            description: "Search the Pali textbook corpus for relevant passages.",
            inputSchema: z.object({ query: z.string().min(1) }),
            execute: async ({ query }, { toolCallId }) => {
              writer.write({
                type: "data-task",
                id: toolCallId,
                data: { label: "ค้นหาเอกสาร", status: "running", query },
              });
              const { matches } = await searchDocuments(query);
              writer.write({
                type: "data-task",
                id: toolCallId,
                data: { label: "ค้นหาเอกสาร", status: "done", matchCount: matches.length },
              });
              writer.write({
                type: "data-reasoning",
                data: { summary: `พบเอกสารที่เกี่ยวข้อง ${matches.length} รายการ` },
              });
              return { matches, context: formatContext(matches) };
            },
          }),
        },
      });

      // Merge the streamed text into the UI message stream
      writer.merge(result.toUIMessageStream({ sendReasoning: false }));

      // After the answer, generate follow-up suggestions if we had matches
      const toolResult = await result.toolCalls;
      // (decide groundedness from the last searchDocs result)
      // Then conditionally write data-suggestions.
    },
    onFinish: async ({ responseMessage }) => {
      // ...generate suggestions if grounded
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

#### Data parts (typed)

| Part type         | Emitted by              | Shape                                                                       |
| ----------------- | ----------------------- | --------------------------------------------------------------------------- |
| `data-reasoning`  | tool executor, after run | `{ summary: string }` (Thai)                                                |
| `data-task`       | tool input/output stream | `{ label: string, status: "running" \| "done" \| "error", query?, matchCount?, message? }` |
| `text` (default)  | model text stream       | (standard AI SDK text parts)                                                |
| `data-suggestions`| `onFinish` (conditional) | `{ suggestions: string[] }` (Thai, length 3)                                |

#### Suggestion generation

- A new service `lib/services/suggestions.ts` exposing `generateSuggestions(context, answer): Promise<string[]>`.
- Uses a small, cheap `generateText` call (same provider, same model) constrained to a Zod schema returning exactly 3 Thai questions.
- Skipped when the last tool call returned `matches.length === 0` (no grounding → no point suggesting related questions).
- Skipped silently on error (graceful degradation).

#### System prompt changes

- Drop the hard "never exceed 100 words" cap. Replace with a length-aware
  instruction: short for factual questions, slightly longer for explanations.
- The prompt is no longer inlined in the route — it moves to
  `lib/chat/pali-system-prompt.ts` so it's testable.

### Frontend — `components/ai/`

A new module under `components/ai/`. The existing
`components/ai/page-actions.tsx` (doc-page copy / open-in-ChatGPT buttons)
is unrelated and stays put.

| File                        | Responsibility                                                                 |
| --------------------------- | ------------------------------------------------------------------------------ |
| `components/ai/ai-message.tsx`     | Orchestrator: reads a `UIMessage`, walks its `parts`, builds step descriptors, renders `timeline-rail` + step column. |
| `components/ai/timeline-rail.tsx`  | Pure render: ordered list of `StepDescriptor` → color-coded nodes + connecting line. |
| `components/ai/reasoning-step.tsx` | Purple, `?` glyph. Renders `data-reasoning.summary`.                         |
| `components/ai/task-step.tsx`      | Amber, ⚙ glyph. Renders `data-task` with status-aware copy.                  |
| `components/ai/response-step.tsx`  | Blue, A glyph. Renders the streamed text + typing cursor.                     |
| `components/ai/suggestion-step.tsx`| Green, → glyph. Renders 3 clickable chips; on click calls `onSelect(text)`.  |
| `components/ai/chat-input.tsx`     | Extracted from `QuestionClient`: textarea + send + regenerate/clear row.     |
| `components/ai/index.tsx`          | Barrel re-exporting the public surface.                                      |

`timeline-rail.tsx` is pure (no hooks). Step components take typed data-part
shapes as props. `ai-message.tsx` is the only component that knows the
part-type → component mapping. This keeps unit boundaries small and tests
focused.

### Hook — `hooks/use-ai-chat.ts`

Wraps `useChat` with project-specific defaults:

```ts
export function useAIChat(): UseAIChatReturn {
  const [error, setError] = useState<string | null>(null);
  const { messages, status, sendMessage, regenerate, stop, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/question" }),
    onError: (err) => setError(mapErrorToThai(err)),
  });
  // ...scroll behavior, clear() helper
  return { messages, status, error, sendMessage, regenerate, stop, clear: () => setMessages([]) };
}
```

Error mapping (quota / 429 / generic → Thai) lives here, not in the
component. `QuestionClient` becomes a thin consumer (~80 lines).

### RAG pipeline — `lib/services/rag-pipeline.ts`

`runRAG(messages, options)` is renamed to `searchDocuments(query: string)`
returning `{ matches, context }`. The old `runRAG` is kept as a thin wrapper
that calls `extractTextFromMessages` then `searchDocuments`, preserving the
public surface for any future callers.

## Data Flow (one turn)

1. User submits in `QuestionClient` → `useAIChat().sendMessage(text)`
2. `POST /api/question` opens a `createUIMessageStream` (Node runtime, 120s)
3. `streamText` runs with the `searchDocs` tool
4. **Reasoning + Task:** if the model calls `searchDocs`:
   - `data-task` (running) is written with the query
   - `searchDocuments` executes
   - `data-task` (done) and `data-reasoning` are written
5. **Response:** the model streams its answer as default `text` parts
6. **Suggestions (conditional):** in `onFinish`, if the last tool call
   returned `matches.length > 0`, `generateSuggestions` runs and writes
   `data-suggestions`
7. **Client:** `useChat` updates `messages`. `ai-message.tsx` walks the
   parts, builds `StepDescriptor[]`, renders the rail + step column
8. **Errors:**
   - Tool throws → `data-task` gets `status: "error"`; the model still
     attempts a response with a "couldn't search docs" prefix
   - LLM call fails → `useAIChat` maps the error to Thai and shows the
     existing red banner
   - Suggestions generation fails → silent skip

## Component Contracts (the unit boundaries)

### `timeline-rail.tsx`
```ts
{ steps: Array<{ id: string; kind: "reasoning" | "task" | "response" | "suggestions"; status: "pending" | "running" | "done" | "error"; label: string }> }
```
Pure render, no hooks. No knowledge of `UIMessage` shape.

### Step components (one each)
- `reasoning-step.tsx` → `{ summary: string }`
- `task-step.tsx` → `{ label, status, query?, matchCount?, message? }` (status drives copy)
- `response-step.tsx` → `{ text: string; isStreaming: boolean }` (typing cursor when streaming)
- `suggestion-step.tsx` → `{ suggestions: string[]; onSelect: (text: string) => void }` (chips, click fires `onSelect`)

### `ai-message.tsx`
Receives one `UIMessage`. Builds the `StepDescriptor[]` and renders
`timeline-rail` next to the column of step components. The only component
that knows the part-type → component mapping.

### `chat-input.tsx`
Textarea + send button + regenerate/clear row. No AI knowledge.

### `use-ai-chat.ts`
```ts
{ messages, status, error, sendMessage, regenerate, stop, clear: () => void }
```

### `searchDocs` tool (server-side, in `app/api/question/route.ts`)
```ts
{ input: { query: string }, output: { matches: DocumentMatch[]; context: string } }
```

## Visual Style

- **Layout:** vertical timeline rail on the left, step column on the right.
- **Colors (per step kind):**
  - Reasoning → purple (`text-purple-600`, `bg-purple-50` / dark variants)
  - Task → amber (`text-amber-700`, `bg-amber-50`)
  - Response → blue (`text-blue-700`, `bg-blue-50`)
  - Suggestions → emerald (`text-emerald-700`, `bg-emerald-50`)
- **Node states:** pending = gray, running = pulse animation, done = solid, error = red.
- **Connecting line:** 1px between nodes, color `border-border`.
- **Mobile:** rail stacks above the step column (Tailwind responsive utilities; no separate code path).
- **Thai text** for all step labels, reasoning summaries, and suggestions.

## Testing Strategy

| File | What it asserts |
| ---- | --------------- |
| `lib/services/rag-pipeline.test.ts` | `searchDocuments`: empty query returns empty; topK default = 5; error propagation. |
| `lib/services/suggestions.test.ts` | `generateSuggestions`: returns array of 3; schema validation rejects malformed output. |
| `lib/chat/pali-system-prompt.test.ts` | Prompt contains the required instructions; no hard length cap. |
| `app/api/question/route.test.ts` | Mock `streamText`; assert the right data parts are written in order; assert `data-suggestions` is skipped when `matches.length === 0`; assert error path emits `data-task` with `status: "error"`. |
| `components/ai/timeline-rail.test.tsx` | Renders one node per step; applies the correct color class for each kind and status. |
| `components/ai/suggestion-step.test.tsx` | Renders one chip per suggestion; clicking a chip fires `onSelect` with the right text. |
| `components/ai/task-step.test.tsx` | Status drives the right copy (running shows the query, done shows match count, error shows the message). |
| `hooks/use-ai-chat.test.tsx` | Maps quota / 429 errors to the Thai quota message; `clear()` empties messages. |

Tests use the project's existing Vitest + jsdom + `@testing-library/react`
setup. For the API route, mock the `streamText` / tool executor to keep
tests deterministic and avoid hitting Pinecone / the LLM provider.

## File Organization

```
app/api/question/route.ts           (refactored)
lib/chat/pali-system-prompt.ts      (new, extracted from route)
lib/chat/pali-system-prompt.test.ts
lib/services/rag-pipeline.ts        (runRAG kept, searchDocuments added)
lib/services/rag-pipeline.test.ts
lib/services/suggestions.ts         (new)
lib/services/suggestions.test.ts
hooks/use-ai-chat.ts                (new)
hooks/use-ai-chat.test.tsx          (new)
components/ai/ai-message.tsx        (new)
components/ai/timeline-rail.tsx     (new)
components/ai/reasoning-step.tsx    (new)
components/ai/task-step.tsx         (new)
components/ai/response-step.tsx     (new)
components/ai/suggestion-step.tsx   (new)
components/ai/chat-input.tsx        (new, extracted from QuestionClient)
components/ai/index.tsx             (new, barrel)
app/(home)/question/QuestionClient.tsx  (refactored: thin consumer of useAIChat + ai-message)
```

`components/ai/page-actions.tsx` is unchanged.

## Risks & Mitigations

| Risk | Mitigation |
| ---- | ---------- |
| `createUIMessageStream` API surface differs from `streamText.toUIMessageStreamResponse()` | Build a thin helper that maps the new shape; tests cover the route. |
| Model occasionally hallucinates tool calls or skips `searchDocs` | The `data-task` / `data-reasoning` are only emitted when the tool actually runs. Suggestions are skipped if no tool ran. Response still streams. |
| Free model (gemma-4-31b-it) may not reliably follow the "always call searchDocs for Pali questions" instruction | Acceptable: when it doesn't, the response still streams; the user just sees no Task / Reasoning / Suggestions for that turn. Document this as expected behavior. |
| Suggestion generation adds latency | Run inside `onFinish` after the answer has streamed; user already sees the answer. |
| MUI Treasury visual clone drifts over time | Pin the visual reference in the design doc; revisit only if MUI Treasury releases a major redesign. |

## Open Questions

None. All design decisions resolved during brainstorming.
