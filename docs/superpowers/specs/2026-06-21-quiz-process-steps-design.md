# Quiz Generation Process Steps + Retrieved Context — Design

## Goal

Replace the quiz's full-screen `LoadingOverlay` with the same per-step
transparency and collapsible reasoning-badge pattern used by the RAG chat
(`/api/question`). While a quiz is generating, the user sees the steps
the pipeline is working on (searching → generating) inline, and the
documents retrieved from the textbook corpus are exposed as a
collapsible badge that stays visible while answering the quiz.

This brings the quiz pipeline to the same level of process transparency
as the RAG pipeline, and unifies the two endpoints on a single transport
(`createUIMessageStream` from the AI SDK) and a single React rendering
pattern (`ProcessStepsInline` + `ProcessBadge` + `ProcessDetails`).

## Non-goals

- Changing the quiz question schema or grading logic.
- Adding new tool calls to the LLM. The `submitQuestions` tool stays as-is.
- Changing the home page entry / topic selection UX.
- Replacing the entire SSE infrastructure on the question route (it is
  already on the new transport; only the quiz route migrates).
- Surfacing the reasoning excerpts in a separate full-page panel. They
  live inside the existing `ProcessBadge` disclosure, same as the RAG UI.

## Background

### Current quiz pipeline (`lib/services/quiz-pipeline.ts:22-115`)

`generateQuizStream` returns a `ReadableStream` that emits four custom
SSE events: `search-done`, `question`, `done`, `error`. The client
parses these in `lib/hooks/use-quiz-ai.ts` with a hand-rolled SSE
parser and a `useReducer` that tracks a `phase` state machine
(`idle | searching | generating | done | error`).

The loading UI is a single full-screen overlay
(`app/(home)/quiz/components/LoadingOverlay.tsx`) with two static
phases (search spinner, generating spinner) and a hard-coded
"ค้นพบเอกสารที่เกี่ยวข้อง N รายการ" line. The actual retrieved passages
are never shown to the user.

### Current RAG pipeline (`app/api/question/route.ts`)

`createUIMessageStream` wraps the `streamText` call and emits typed
data parts: `data-status`, `data-task`, `data-reasoning`,
`data-suggestions`. The client (`hooks/use-ai-chat.ts` +
`components/ai/ai-message.tsx`) renders these via three components:

- `ProcessStepsInline` — the timeline rail above the response that
  collapses when streaming finishes.
- `ProcessBadge` — a clickable summary that reveals
  `ProcessDetails` (rail + `ReasoningStep` cards + `TaskStep` cards).
- `ProcessDetails` — the full timeline rail with reasoning excerpts
  (first 120 chars of each retrieved passage).

The RAG pattern is the right shape for the quiz: same phases
(searching → generating), same data flows, same reasoning
excerpts.

## Design

### 1. Server pipeline — unify on `createUIMessageStream`

Rewrite `lib/services/quiz-pipeline.ts:22-115` to return a
`UIMessageStream` (the same type the question route returns) instead
of a custom SSE `ReadableStream`. The new function signature:

```ts
export function generateQuizStream(input: QuizInput): UIMessageStream
```

The `execute` callback inside `createUIMessageStream` runs the same
two phases the current code runs, but writes typed parts to the
stream:

1. **Searching**
   - `writer.write({ type: "data-status", data: { phase: "searching" } })`
   - `writer.write({ type: "data-task", data: { id, label: "ค้นหาเอกสาร", status: "running" } })`
   - Call `generateEmbedding(topics.join(", "))` and `queryPinecone(embedding, 10)`.
   - On success: `writer.write({ type: "data-task", data: { id, label: "ค้นหาเอกสาร", status: "done", matchCount } })` and `writer.write({ type: "data-reasoning", data: { summary: \`พบเอกสารที่เกี่ยวข้อง ${matchCount} รายการ\`, excerpts: matches.slice(0, 10).map(m => m.text.slice(0, 120).trim()) } })`.
   - On error: `writer.write({ type: "data-task", data: { id, label: "ค้นหาเอกสาร", status: "error", message } })`, set `matches = []` and continue with empty context (same behavior as `app/api/question/route.ts:116-129`).
2. **Generating**
   - `writer.write({ type: "data-status", data: { phase: "answering" } })`
   - Build `context = formatContext(matches)` (empty string if error path).
   - `streamText` with the `submitQuestions` tool. The tool's `execute` is rewritten to write a `data-question` part per question (see part schema below) instead of the old `send("question", q)` SSE call. The total question count is no longer tracked server-side; the client derives it from the part list.
   - `writer.merge(result.toUIMessageStream({ sendReasoning: false }))` and `await result.consumeStream()`.
   - `prepareStep` injects the formatted context into the system prompt for steps after the first (same pattern as the question route's `prepareStep`).

The `submitQuestions` tool execute emits a new part type
(`data-question`) so questions are filtered cleanly on the client
without conflating them with `data-task` steps.

Delete the dead `generateQuiz` function (lines 135-190 of the current
file) — it is not used anywhere in the codebase and is a leftover from
before the SSE pipeline was added. Keep `isQuotaError` where it is
(still used by `app/api/quiz/route.ts` and the route's tests).

### 2. Route — return the unified stream

Update `app/api/quiz/route.ts:14-26`:

- Call `generateQuizStream({ topics, amount })` (synchronous, no await).
- Return `createUIMessageStreamResponse({ stream })` from the AI SDK
  instead of wrapping the stream in a custom `Response`.
- Keep the existing `try/catch` with the same error mapping
  (quota → 429, otherwise → 500) and the same Thai error messages.

### 3. New part schema — `data-question`

Add to `lib/schemas/ai-data-parts.ts`:

```ts
export const questionPartSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  option1: z.string(),
  option2: z.string(),
  option3: z.string(),
});
export type QuestionPart = z.infer<typeof questionPartSchema>;
```

And extend the `DataPart` union in `lib/chat/message-parts.ts` to
include `{ type: "data-question"; data: QuestionPart }`. `isDataPart`
returns `true` for `data-question` as well.

### 4. Client hook — wrap `useChat`

Rewrite `lib/hooks/use-quiz-ai.ts` to wrap `useChat` from `@ai-sdk/react`
(same pattern as `hooks/use-ai-chat.ts`):

```ts
const { messages, status, error, sendMessage, stop, setMessages } = useChat({
  transport: new DefaultChatTransport({ api: "/api/quiz" }),
  onError: (err) => setTransportError(mapErrorToThai(err)),
});
```

State derivation (all in `useMemo` over `messages`):

- `phase`:
  - `"searching"` if no `data-task` part with `label === "ค้นหาเอกสาร"` and `status === "done"` has arrived yet, AND no `data-question` parts exist.
  - `"generating"` if a `done` `data-task` part exists but no `data-question` parts exist.
  - `"done"` if the stream is complete (`status === "ready"`) OR at least one `data-question` exists AND no more parts are arriving.
  - `"error"` if `error` is set.
- `matchCount`: from the latest `data-task` part with `label === "ค้นหาเอกสาร"` (or 0).
- `questions`: from all `data-question` parts in order.
- `excerpts`: from the single `data-reasoning` part (or empty array).
- `stepDescriptors`: same `StepDescriptor[]` shape as `AIMessage` builds.

Race protection: keep a `requestIdRef` ref. Each `submit` increments
the ref and `setMessages([])` before `sendMessage(...)`. The
`useMemo` derivations ignore messages from prior runs because
`setMessages([])` wipes them, but the ref is kept as defense in depth.

### 5. New component — `QuizProcess`

Create `app/(home)/quiz/components/QuizProcess.tsx` (orchestrator):

Props:

```ts
{
  messages: UIMessage[];
  isStreaming: boolean;       // status === "streaming" || status === "submitted"
  matchCount: number;
  error: Error | null;
  onRetry?: () => void;
}
```

Renders the same composition as `AIMessage`:
1. `ProcessStepsInline` with `steps`, `reasoning`, `tasks`, `isDone`
   (derived from messages). Only the search task is rendered as a
   `TaskStep`; the question events are not turned into steps — they
   flow into the questions list and into the LLM's text output.
2. `ProcessBadge` with the match-count label and a `ProcessDetails`
   child.

This component is rendered in two places:
- On the home/loading state (replacing `LoadingOverlay`).
- At the top of `QuizState` (while answering), showing only the badge
  (steps collapsed). The `QuizProcess` component accepts a `mode: "full" | "badge-only"` prop to switch between the two.

### 6. `QuizContents` — drop `LoadingOverlay`

In `app/(home)/quiz/components/QuizContents.tsx:57-66`, replace:

```tsx
if (appState === "loading") {
  return <LoadingOverlay error={getErrorMessage(error)} onRetry={handleRetry} phase={...} matchCount={...} />;
}
```

with:

```tsx
if (appState === "loading") {
  return (
    <QuizProcess
      messages={messages}
      isStreaming={status === "streaming" || status === "submitted"}
      matchCount={matchCount}
      error={error}
      onRetry={handleRetry}
      mode="full"
    />
  );
}
```

Keep the error retry path. The `QuizProcess` component shows the error
inline (using `ProcessBadge` with the error state) plus a retry
button. The `mode="full"` prop tells `QuizProcess` to render both the
inline steps and the badge (the loading state needs both).

### 7. `QuizState` — keep the badge visible

In `app/(home)/quiz/states/QuizState.tsx`, add a new prop
`quizContext?: { messages: UIMessage[]; matchCount: number }` and
render `QuizProcess` with `mode="badge-only"` at the top of the card
area (above the title). The inline steps are not shown in this state
because the user is answering questions, not watching the pipeline
run; the badge gives one-click access to the reasoning excerpts that
informed the questions.

When the user submits (results state), the badge is no longer
relevant — `QuizContents` passes `quizContext={null}` (or omits it)
in the `appState === "results"` branch.

### 8. Hook signature

The public signature of `useQuizAI` changes from:

```ts
{
  phase, matchCount, questions, error, submit
}
```

to:

```ts
{
  // Derived from messages
  phase, matchCount, questions, error,
  // Raw from useChat — passed through to QuizProcess
  messages, status,
  // Actions
  submit, stop, clear
}
```

`submit(payload)` still takes `{ topics, amount }`; internally it
calls `setMessages([])` and `sendMessage({ text: JSON.stringify(payload) })`
(or a structured `sendMessage` form, depending on what `useChat` accepts
for non-text payloads — see writing-plans for the exact call shape).

`hooks/use-quiz.ts:23-44` and `hooks/use-quiz.ts:115-131` (the effects
that transition loading → quiz and append new questions) are updated
to read `phase` and `questions` from the new derived state and to
treat `messages` and `status` as the source of truth for what the
pipeline is currently doing.

## Data flow

### Successful quiz with 10 matches and 5 questions

| Order | Event              | Part type        | Payload                                                        |
| ----: | ------------------ | ---------------- | -------------------------------------------------------------- |
| 1     | `data-status`      | `data-status`    | `{ phase: "searching" }`                                       |
| 2     | `data-task`        | `data-task`      | `{ id, label: "ค้นหาเอกสาร", status: "running" }`              |
| 3     | `data-task`        | `data-task`      | `{ id, label: "ค้นหาเอกสาร", status: "done", matchCount: 10 }`  |
| 4     | `data-reasoning`   | `data-reasoning` | `{ summary: "พบเอกสาร 10 รายการ", excerpts: [10 excerpts] }`   |
| 5     | `data-status`      | `data-status`    | `{ phase: "answering" }`                                       |
| 6     | `data-question` ×N | `data-question`  | `{ id, question, answer, option1, option2, option3 }`          |

The stream closes when `streamText` finishes; the AI SDK writes a
`finish` part automatically. The client treats `status === "ready"`
as the implicit `done` phase.

### Error: Pinecone throws on search

- Step 2 emits `data-task { status: "error", message }`.
- Steps 3-4 are skipped (no matches, no reasoning part).
- Step 5 still emits `data-status { phase: "answering" }`.
- The LLM is called with an empty context and (if it succeeds) emits
  questions normally. If it fails, the AI SDK propagates the error
  to `useChat.error`.

### Error: LLM quota exceeded

- Caught at route level (not streamed). Returns HTTP 429 with the
  Thai quota message. `useChat.error` is set; `QuizProcess` shows the
  error state.

## Error handling

| Failure                          | Server behavior                                                                                                       | Client behavior                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Pinecone search throws           | Emit `data-task { status: "error", message }`, continue with empty context                                            | Step shows as error in inline rail; if no questions arrive, `useChat.error` surfaces and badge retries  |
| LLM tool call throws             | AI SDK ends the stream with an error part                                                                             | `useChat.error` set; `QuizProcess` shows error badge                                                     |
| Quota exceeded                   | Route catches `isQuotaError`, returns HTTP 429 with Thai message                                                      | `useChat.error` set; `getErrorMessage` maps to Thai quota copy                                           |
| Network failure / abort          | `useChat` aborts the request                                                                                          | `status === "ready"`, no message parts added; `clear()` available                                       |
| User clicks retry                | New `setMessages([])` + `sendMessage(...)`                                                                            | New `requestId`, old parts discarded                                                                    |

## Testing

### `tests/quiz-pipeline.test.ts` (rewrite)

- Mock `streamText` and `createUIMessageStream` (same pattern as
  `tests/route.test.ts:14-71`).
- Call `generateQuizStream({ topics: ["x"], amount: 3 })` and capture
  the writes.
- Assert write order: `data-status(searching)`, `data-task(running)`,
  `data-task(done with matchCount)`, `data-reasoning`, then
  `data-status(answering)`, then per-tool-call `data-question` parts.
- Add a test for the Pinecone error path: mock `queryPinecone` to
  throw, assert a single `data-task { status: "error" }` is emitted
  before the `data-status(answering)` part.

### `tests/quiz-route.test.ts` (update)

- The existing `vi.mock("@/lib/services/quiz-pipeline", …)` stays.
- Assert the route returns a `Response` (the new return type) and
  preserves the 500 error mapping for invalid input.

### `lib/hooks/use-quiz-ai.test.ts` (new)

- Render with `useChat` mocked via `@testing-library/react`.
- Assert that after the server emits the expected parts, the hook
  exposes `matchCount`, `questions`, `phase` correctly.
- Test race protection: a second `submit` while the first is in
  flight discards the first stream's parts.

### `app/(home)/quiz/components/QuizContents.test.tsx` (new)

- Render with `useQuiz()` returning a mock state where
  `appState === "loading"`, `matchCount === 3`. Assert that
  `QuizProcess` is rendered (and `LoadingOverlay` is not).
- Render with `appState === "quiz"`. Assert the badge is present at
  the top of the rendered tree.

## File changes

| File                                                                                | Change                                                                                  |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `lib/schemas/ai-data-parts.ts`                                                      | Add `questionPartSchema` + `QuestionPart` type                                          |
| `lib/chat/message-parts.ts`                                                         | Extend `DataPart` union and `isDataPart` to include `data-question`                     |
| `lib/services/quiz-pipeline.ts`                                                     | Rewrite `generateQuizStream` to return `UIMessageStream`; delete dead `generateQuiz`    |
| `app/api/quiz/route.ts`                                                             | Return `createUIMessageStreamResponse`; keep quota + 500 error mapping                  |
| `lib/hooks/use-quiz-ai.ts`                                                          | Rewrite to wrap `useChat` and derive state from `messages`; expose new public signature |
| `app/(home)/quiz/components/QuizProcess.tsx`                                        | New — orchestrates `ProcessStepsInline` + `ProcessBadge` + `ProcessDetails`             |
| `app/(home)/quiz/components/QuizContents.tsx`                                        | Replace `LoadingOverlay` usage with `QuizProcess` (`mode="full"`); pass `quizContext`   |
| `app/(home)/quiz/components/LoadingOverlay.tsx`                                      | Delete — superseded by `QuizProcess`                                                    |
| `app/(home)/quiz/states/QuizState.tsx`                                              | Accept `quizContext` prop, render `QuizProcess` (`mode="badge-only"`) at top            |
| `hooks/use-quiz.ts`                                                                 | Update to consume new hook signature; pass `quizContext` to `QuizState`                 |
| `tests/quiz-pipeline.test.ts`                                                       | Rewrite to assert `UIMessageStream` writes                                             |
| `tests/quiz-route.test.ts`                                                          | Update assertions for new return shape                                                  |
| `lib/hooks/use-quiz-ai.test.ts`                                                     | New — hook behavior + race protection                                                   |
| `app/(home)/quiz/components/QuizContents.test.tsx`                                  | New — component-level assertions                                                       |

## Open questions

None. All four major design decisions are approved.
