# Quiz Workflow

## Overview

The quiz feature generates multiple-choice Pali grammar questions dynamically via AI. A user selects a topic, the system loads curated textbook content from a static JSON file, and an LLM generates questions based on that content. All questions arrive at once after generation, and results are displayed with scoring under a countdown timer.

## Architecture

```
User clicks topic
       │
       ▼
   HomeState
       │
       │ startQuiz(topicId)
       ▼
   useQuiz (orchestrator)
       │
       ├── useQuizFlow → "loading"
       ├── useQuizUI  → reset pagination
       ├── useQuizData → set topic, clear answers
       └── useQuizAI  → submit({ topics, amount, topicId })
               │
               │ POST /api/quiz (SSE)
               ▼
         API Route (app/api/quiz/route.ts)
               │
               │ generateQuizStream(input)
               ▼
         Quiz Pipeline (lib/services/quiz-pipeline.ts)
               │
               ├── loadContent(topicId) → quiz-content.json
               ├── SSE: data-task (search done)
               ├── streamText → LLM generates JSON
               ├── Parse JSON → validate with quizResponseSchema
               ├── SSE: data-question (all at once)
               └── SSE: [DONE]
               │
               ▼
         useQuizAI parses SSE stream
               │
               ├── data-task done → phase="generating", matchCount=N
               ├── data-question → append to questions[]
               └── [DONE] → phase="done"
               │
               ▼
         useQuizAI.questions updates
               │
               ▼
         mapQuestionsFromResponse(raw → Question[])
               │
               ▼
         useQuizFlow → "quiz"  (all questions ready)
               │
               ▼
           QuizState
               │
               ├── QuizTimer (countdown)
               ├── QuizPagination (5 per page)
               ├── QuizQuestion (radio group options)
               └── Submit button
               │
               ├── submitQuiz → "results"
               └── timeUp → marks expired → "results"
               │
               ▼
           ResultState
               ├── Score (percentage, correct/total)
               ├── Review answers (correct/incorrect highlighted)
               └── Restart → "home"
```

## Step-by-Step Flow

### 1. Topic Selection (HomeState)

The user lands on the quiz page (`app/(home)/quiz/page.tsx`). `QuizContents` renders `HomeState`, which displays topic cards from `data/quiz-topic.tsx`. Each card shows:

| Field | Description |
|-------|-------------|
| `id` | Unique topic identifier |
| `title` | Thai topic name (e.g. "อักขรวิธี") |
| `keywords` | Pali grammar terms used for prompt context |
| `amount` | Number of questions (15 or 30) |
| `time` | Time limit in minutes (10 or 15) |

Clicking "เริ่มทำแบบทดสอบ" calls `onStartQuiz(topicId)`.

### 2. Orchestration (useQuiz)

The `useQuiz` hook (`hooks/use-quiz.ts`) composes 5 sub-hooks to manage the entire quiz lifecycle:

| Sub-hook | File | Responsibility |
|----------|------|----------------|
| `useQuizFlow` | `lib/hooks/use-quiz-flow.ts` | App state machine: `home → loading → quiz → results` |
| `useQuizData` | `lib/hooks/use-quiz-data.ts` | Selected topic, questions array, answers map |
| `useQuizUI` | `lib/hooks/use-quiz-ui.ts` | Current page, completed flag, timeExpired flag |
| `useQuizAI` | `lib/hooks/use-quiz-ai.ts` | SSE stream reader + question accumulation |
| `useQuizStats` | `lib/hooks/use-quiz-stats.ts` | Computed stats (progress, score) via `getStats()` |

On `startQuiz(topicId)`:

1. `useQuizData.setTopic(topicId)` — stores selected topic
2. `useQuizFlow.start()` — sets state to `"loading"`
3. `useQuizUI.reset()` — resets pagination to page 1
4. `useQuizData.clearAnswers()` — clears previous answers
5. `useQuizAI.submit({ amount, topics, topicId })` — fires SSE request

### 3. AI Question Generation (useQuizAI → SSE Stream)

**Client side** — `useQuizAI` (`lib/hooks/use-quiz-ai.ts`) fetches the quiz API via `useChat` with `DefaultChatTransport`:

The client POSTs a JSON payload to `/api/quiz` inside a chat message:
```json
{
  "messages": [{
    "role": "user",
    "parts": [{ "type": "text", "text": "{\"amount\":15,\"topics\":[\"...\"],\"topicId\":\"1\"}" }]
  }]
}
```

**SSE Event types (via `createUIMessageStream`):**

| Event | When | Payload |
|-------|------|---------|
| `data-status` | Phase transitions | `{ phase: "searching" \| "answering" }` |
| `data-task` | Content loading status | `{ label: "ค้นหาเอกสาร", status, matchCount }` |
| `data-question` | Each generated question | `{ id, question, answer, option1, option2, option3 }` |

**API Route** (`app/api/quiz/route.ts`):
- Parses chat message body with `quizSchema` (Zod) including `topicId`
- Calls `generateQuizStream()` → returns SSE `Response`
- `maxDuration: 60` seconds
- Handles errors with Thai messages for quota (429) and generic errors

**Pipeline** (`lib/services/quiz-pipeline.ts`):

```
generateQuizStream(input)
  │
  ├── loadContent(topicId) → quiz-content.json
  │     Loads static Pali grammar content for the topic
  │
  ├── SSE: data-task (running → done, matchCount=1)
  │
  ├── streamText({
  │       model: llm(getDefaultModel()),
  │       prompt: buildQuizPrompt(context, amount, topics)
  │     })
  │     │
  │     └── await result.text
  │           │
  │           ├── JSON.parse → validate with quizResponseSchema
  │           └── SSE: data-question × N
  │
  └── Stream closes
```

**Key design decisions:**
- Uses `streamText` to generate raw JSON text (no structured output mode, no tools) — works reliably across all OpenAI-compatible providers without requiring `response_format: json_object` support
- Content source is `data/quiz-content.json` — static curated Pali grammar text for each topic, eliminating Pinecone dependency and latency
- All questions are generated in a single LLM call — no multi-step tool-calling loop
- After the LLM completes, the JSON is parsed and all questions are written to the SSE stream at once

### 4. Loading Phase Display

During the `"loading"` app state, `QuizContents` renders:

```tsx
<div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
  <QuizProcess messages={messages} ... mode="full" />
  <QuizStatus phase={phase} />
</div>
```

The phase indicator (`components/ai/quiz-status.tsx`) shows:

| Phase | Icon | Label |
|-------|------|-------|
| `searching` | `Search` + spinner | "กำลังค้นหาเนื้อหา..." |
| `generating` | `FileQuestion` + spinner | "กำลังสร้างคำถาม..." |

When all questions arrive, the app transitions from `"loading"` to `"quiz"`.

### 5. Question Mapping

`mapQuestionsFromResponse` (`helpers/map-questions.ts`) transforms each raw question:
- Uses `question.id` from the stream (e.g., `q-2`) as the question ID
- Shuffles the 4 options randomly using Fisher-Yates shuffle
- Creates deterministic option IDs (`{qId}-opt-{index}`)
- Computes `answerId` to match the correct option's ID after shuffle

### 6. Quiz State (QuizState)

`QuizState` (`app/(home)/quiz/states/QuizState.tsx`) renders:

| Component | Purpose |
|-----------|---------|
| `QuizTimer` | Countdown timer; calls `onTimeUp` when expired |
| Progress bar | Shows answered count vs total |
| `QuizQuestion` × 5 | Current page of questions with radio options |
| `QuizPagination` | Previous/next page navigation + page buttons |
| Submit button | Enabled only when all questions answered or time expired |

**Pagination:** 5 questions per page. Submit is available on any page once all questions are answered.

**Timer** (`components/QuizTimer.tsx`):
- Counts down from `topic.time * 60` seconds
- Shows MM:SS with progress bar
- Pulses red when <20% time remains
- Calls `onTimeUp()` at zero

### 7. Answer Selection

`useQuizData.answer(questionId, optionId)` updates the answers map:
```ts
answers = { "q-2": "q-2-opt-1", "q-3": "time-expired", ... }
```

`useQuizStats` computes live stats via `getStats()` (`helpers/get-stats.ts`):
- `answeredQuestionsCount` — keys in answers map
- `progressPercentage` — answered / total × 100
- `allQuestionsAnswered` — answered === total
- `score` — correct count (matching `answerId`), total, percentage

### 8. Submission

**Manual submit:** When user clicks Submit and all questions are answered:
```ts
ui.markComplete();
flow.goToResults();
```

**Time expiry:** Timer reaches zero:
```ts
ui.markExpired();
// Mark all unanswered as "time-expired"
data.setAnswers(prev => {
  for (const q of data.questions) {
    if (!next[q.id]) next[q.id] = "time-expired";
  }
});
ui.markComplete();
flow.goToResults();
```

### 9. Results (ResultState)

`ResultState` (`app/(home)/quiz/states/ResultState.tsx`) shows:

- **Score card** — percentage (large), correct/total count, progress bar
- **Answer review** — each question with the user's selected option highlighted:
  - Correct answer → green border + "Correct" label
  - Wrong answer → red border + "Incorrect" label
  - Time-expired → amber message "หมดเวลา - คำถามไม่ได้รับคำตอบ"
  - Correct answer is always shown with green highlight
- **Restart button** — returns to home state, clears all data

## Key Files

| File | Role |
|------|------|
| `app/(home)/quiz/page.tsx` | Entry page |
| `app/(home)/quiz/layout.tsx` | Layout wrapper |
| `app/(home)/quiz/components/QuizContents.tsx` | Client component, state router |
| `app/(home)/quiz/states/HomeState.tsx` | Topic selection grid |
| `app/(home)/quiz/states/QuizState.tsx` | Active quiz UI |
| `app/(home)/quiz/states/ResultState.tsx` | Results and review |
| `app/(home)/quiz/components/QuizTimer.tsx` | Countdown timer |
| `app/(home)/quiz/components/QuizQuestont.tsx` | Question + options display |
| `app/(home)/quiz/components/QuizPagination.tsx` | Page navigation |
| `app/(home)/quiz/components/QuizProcess.tsx` | Loading orchestrator (search task + reasoning display) |
| `app/(home)/quiz/components/Disclaimer.tsx` | Disclaimer footer |
| `components/ai/quiz-status.tsx` | Phase status indicator (searching → generating) |
| `hooks/use-quiz.ts` | Orchestrator hook |
| `lib/hooks/use-quiz-flow.ts` | App state machine |
| `lib/hooks/use-quiz-data.ts` | Quiz data state |
| `lib/hooks/use-quiz-ui.ts` | UI state (page, completed, expired) |
| `lib/hooks/use-quiz-ai.ts` | SSE stream reader + phase derivation |
| `lib/hooks/use-quiz-stats.ts` | Live scoring/progress computation |
| `lib/services/quiz-pipeline.ts` | Content loading + `streamText` + JSON parse |
| `lib/schemas/quiz.ts` | Zod schemas (`quizSchema`, `quizResponseSchema`) |
| `app/api/quiz/route.ts` | API route (SSE response + error handling) |
| `data/quiz-topic.tsx` | Topic definitions with keywords |
| `data/quiz-content.json` | Curated Pali grammar content per topic |
| `helpers/map-questions.ts` | Raw → `Question[]` transformation |
| `helpers/get-stats.ts` | Score and progress computation |

## App States

| State | Component | Description |
|-------|-----------|-------------|
| `home` | `HomeState` | Topic selection grid |
| `loading` | `QuizProcess` + `QuizStatus` | Phase indicator shows "กำลังค้นหาเนื้อหา..." → "กำลังสร้างคำถาม..." |
| `quiz` | `QuizState` | All questions loaded, timer, pagination |
| `results` | `ResultState` | Score and answer review |

## Streaming Events

| SSE Event | Direction | Payload |
|-----------|-----------|---------|
| `data-task` | Server → Client | `{ label: "ค้นหาเอกสาร", status: "running" \| "done", matchCount }` |
| `data-question` | Server → Client | `{ id, question, answer, option1, option2, option3 }` |
| `data-status` | Server → Client | `{ phase: "searching" \| "answering" }` |

## Environment Variables

| Variable | Used By |
|----------|---------|
| `PROVIDER_NAME` | LLM provider selection (`openrouter` or `opencode`, default: `openrouter`) |
| `OPENROUTER_API_KEY` / `OPENAI_API_KEY` | OpenRouter provider API key |
| `OPENROUTER_LLM_MODEL` / `LLM_MODEL` | Model for OpenRouter (default: `google/gemma-3-27b-it:free`) |
| `OPENCODE_API_KEY` | OpenCode provider API key |
| `OPENCODE_LLM_MODEL` | Model for OpenCode (default: `deepseek-v4-flash`) |

> Quiz generation no longer requires Pinecone. Context is sourced from `data/quiz-content.json`.

## LLM Provider Configuration

The quiz uses `llm(getDefaultModel())` from `lib/services/llm-provider.ts`, which routes to the provider selected by `PROVIDER_NAME`:

| Provider | `PROVIDER_NAME` | Base URL | Key Env Vars |
|----------|-----------------|----------|--------------|
| OpenRouter | `openrouter` (default) | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY`, `OPENROUTER_LLM_MODEL` |
| OpenCode | `opencode` | `https://opencode.ai/zen/go/v1` | `OPENCODE_API_KEY`, `OPENCODE_LLM_MODEL` |
