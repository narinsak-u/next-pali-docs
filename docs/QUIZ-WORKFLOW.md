# Quiz Workflow

## Overview

The quiz feature generates multiple-choice Pali grammar questions dynamically via AI. A user selects a topic, the system retrieves relevant textbook context from Pinecone, and an LLM generates questions tailored to that context — **streaming each question to the client as it's generated**. Questions are answered under a countdown timer, and results are displayed with scoring.

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
       └── useQuizAI  → submit({ topics, amount })
               │
               │ POST /api/quiz (SSE)
               ▼
         API Route (app/api/quiz/route.ts)
               │
               │ generateQuizStream(input)
               ▼
         Quiz Pipeline (lib/services/quiz-pipeline.ts)
               │
               ├── generateEmbedding(topics)
               ├── queryPinecone(vector, topK=10)
               ├── SSE: event=search-done
               ├── streamText + submitQuestions tool
               │     ├── SSE: event=question (one per question)
               │     ├── SSE: event=question
               │     └── ...
               └── SSE: event=done
               │
               ▼
         useQuizAI parses SSE stream
               │
               ├── search-done → phase="generating", matchCount=N
               ├── question → append to questions[]
               └── done → phase="done"
               │
               ▼
         useQuizAI.questions updates
               │
               ▼
         mapQuestionsFromResponse(raw → Question[])
               │
               ▼
         useQuizFlow → "quiz"  (on first question)
               │
               ▼
           QuizState
               │
               ├── QuizTimer (countdown)
               ├── QuizPagination (5 per page)
               ├── QuizQuestion (radio group options)
               ├── "กำลังสร้างคำถามเพิ่มเติม..." banner (while generating)
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
| `keywords` | Pali grammar terms used for vector search |
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
5. `useQuizAI.submit({ amount, topics })` — fires SSE request

### 3. AI Question Generation (useQuizAI → SSE Stream)

**Client side** — `useQuizAI` (`lib/hooks/use-quiz-ai.ts`) fetches the quiz API via raw `fetch` and reads a Server-Sent Events (SSE) stream:

```ts
// Client sends POST to /api/quiz, reads SSE response
const response = await fetch("/api/quiz", {
  method: "POST",
  body: JSON.stringify({ topics, amount }),
});
// Read SSE events: search-done, question, done, error
```

**SSE Event types:**

| Event | When | Payload |
|-------|------|---------|
| `search-done` | After Pinecone vector search completes | `{ matchCount: number }` |
| `question` | Each time the model submits a question via tool | `{ question, answer, option1, option2, option3 }` |
| `done` | All questions generated | `{ total: number }` |
| `error` | Pipeline or generation failure | `{ message: string }` |

**API Route** (`app/api/quiz/route.ts`):
- Parses JSON body with `quizSchema` (Zod)
- Calls `generateQuizStream()` → returns SSE `Response`
- Handles errors with Thai messages for quota (429) and generic errors

**Pipeline** (`lib/services/quiz-pipeline.ts`):

```
generateQuizStream(input)
  │
  ├── generateEmbedding(topics.join(", "))
  │     Uses Pinecone Inference API (llama-text-embed-v2)
  │
  ├── queryPinecone(embedding, topK=10)
  │     Searches the Pali textbook vector store
  │
  ├── formatContext(matches)
  │     Joins matched text with "\n---\n" separators
  │
  ├── SSE: event=search-done { matchCount }
  │
  └── streamText({
        model: llm(getDefaultModel()),
        system: "You are a quiz generator...",
        messages: [{ role: "user", content: "Generate N questions..." }],
        tools: {
          submitQuestions: tool({
            inputSchema: z.object({
              questions: z.array(z.object({
                question: z.string(),
                answer: z.string(),
                option1: z.string(),
                option2: z.string(),
                option3: z.string(),
              }))
            }),
            execute: ({ questions }) => {
              for (const q of questions) sendSSE("question", q);
              return { submitted, remaining };
            }
          })
        },
        stopWhen: stepCountIs(15),
      })
```

**Key design decisions:**
- Uses `streamText` + `submitQuestions` tool instead of `streamObject` — this allows **true streaming**: each question is emitted immediately via SSE when the model calls the tool, rather than waiting for the entire JSON response
- The model calls `submitQuestions` in batches (1-5 questions per call), each batch writes `question` SSE events
- `stopWhen: stepCountIs(15)` allows up to 15 tool-calling steps to accommodate models that call tools multiple times

### 4. Progressive Question Display

As SSE `question` events arrive, the client works in real-time:

1. `useQuizAI` appends each question to `questions[]` state
2. `mapQuestionsFromResponse` transforms raw questions to `Question[]` format (with shuffled options)
3. On the **first** question received, `useQuizFlow` transitions from `loading` to `quiz`
4. Subsequent questions update the `Question[]` array in-place — the quiz UI shows more questions as they arrive
5. A `"กำลังสร้างคำถามเพิ่มเติม..."` banner appears below the progress bar while `isGenerating` is true
6. When `done` event arrives, `isGenerating` becomes false, banner disappears

**Loading phases:**

| Phase | App State | UI |
|-------|-----------|-----|
| Searching | `loading` | LoadingOverlay: "กำลังค้นหาเนื้อหา..." + search icon |
| Generating | `loading` | LoadingOverlay: "AI กำลังสร้างแบบทดสอบ" + match count |
| First question | `quiz` | QuizState appears with first question + "กำลังสร้างคำถามเพิ่มเติม..." |
| Stream in progress | `quiz` | Questions appear one by one, banner still visible |
| Done | `quiz` | All questions visible, banner gone |

### 5. Question Mapping

`mapQuestionsFromResponse` (`helpers/map-questions.ts`) transforms each raw question:
- Creates `id` from `questionText + index`
- Shuffles the 4 options randomly
- Creates option `id` from `text + questionText`
- Sets `answerId` as the correct answer's computed id
- Filters out entries with missing `question` or `answer` fields

### 6. Quiz State (QuizState)

`QuizState` (`app/(home)/quiz/states/QuizState.tsx`) renders:

| Component | Purpose |
|-----------|---------|
| `QuizTimer` | Countdown timer; calls `onTimeUp` when expired |
| Progress bar | Shows answered count vs total |
| Generating banner | `"กำลังสร้างคำถามเพิ่มเติม..."` while questions are still being streamed |
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
answers = { "q1": "TruthWhat is sacca?", "q2": "time-expired", ... }
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
| `app/(home)/quiz/states/QuizState.tsx` | Active quiz UI (with generating banner) |
| `app/(home)/quiz/states/ResultState.tsx` | Results and review |
| `app/(home)/quiz/components/QuizTimer.tsx` | Countdown timer |
| `app/(home)/quiz/components/QuizQuestont.tsx` | Question + options display |
| `app/(home)/quiz/components/QuizPagination.tsx` | Page navigation |
| `app/(home)/quiz/components/LoadingOverlay.tsx` | Phased loading screen (searching → generating) |
| `app/(home)/quiz/components/Disclaimer.tsx` | Disclaimer footer |
| `hooks/use-quiz.ts` | Orchestrator hook |
| `lib/hooks/use-quiz-flow.ts` | App state machine |
| `lib/hooks/use-quiz-data.ts` | Quiz data state |
| `lib/hooks/use-quiz-ui.ts` | UI state (page, completed, expired) |
| `lib/hooks/use-quiz-ai.ts` | SSE stream reader — replaces `useObject` |
| `lib/hooks/use-quiz-stats.ts` | Live scoring/progress computation |
| `lib/services/quiz-pipeline.ts` | RAG pipeline + `streamText` + `submitQuestions` tool |
| `lib/schemas/quiz.ts` | Zod schemas (`quizSchema`, `quizResponseSchema`) |
| `app/api/quiz/route.ts` | API route (SSE response + error handling) |
| `data/quiz-topic.tsx` | Topic definitions with keywords |
| `helpers/map-questions.ts` | Raw → `Question[]` transformation |
| `helpers/get-stats.ts` | Score and progress computation |

## App States

| State | Component | Description |
|-------|-----------|-------------|
| `home` | `HomeState` | Topic selection grid |
| `loading` | `LoadingOverlay` | Phased: "กำลังค้นหาเนื้อหา..." → "AI กำลังสร้างแบบทดสอบ" |
| `quiz` | `QuizState` | Questions (appear progressively), timer, pagination, generating banner |
| `results` | `ResultState` | Score and answer review |

## Streaming Events

| SSE Event | Direction | Payload |
|-----------|-----------|---------|
| `search-done` | Server → Client | `{ matchCount: number }` |
| `question` | Server → Client | `{ question, answer, option1, option2, option3 }` |
| `done` | Server → Client | `{ total: number }` |
| `error` | Server → Client | `{ message: string }` |

## Environment Variables

| Variable | Used By |
|----------|---------|
| `PINECONE_API_KEY` | Vector store query for context retrieval |
| `PINECONE_INDEX_NAME` | Pinecone index |
| `PINECONE_NAMESPACE` | Pinecone namespace |
| `PROVIDER_NAME` | LLM provider selection (`openrouter` or `opencode`, default: `openrouter`) |
| `OPENROUTER_API_KEY` / `OPENAI_API_KEY` | OpenRouter provider API key |
| `OPENROUTER_LLM_MODEL` / `LLM_MODEL` | Model for OpenRouter (default: `google/gemma-3-27b-it:free`) |
| `OPENCODE_API_KEY` | OpenCode provider API key |
| `OPENCODE_LLM_MODEL` | Model for OpenCode (default: `deepseek-v4-flash`) |

## Models

| Model | Provider | Used For |
|-------|----------|----------|
| `llama-text-embed-v2` | Pinecone Inference | Embedding topics for vector search |
| Configurable via `PROVIDER_NAME` | OpenRouter/OpenCode | Generating quiz questions via `streamText` + tools |

## LLM Provider Configuration

The quiz uses `llm(getDefaultModel())` from `lib/services/llm-provider.ts`, which routes to the provider selected by `PROVIDER_NAME`:

| Provider | `PROVIDER_NAME` | Base URL | Key Env Vars |
|----------|-----------------|----------|--------------|
| OpenRouter | `openrouter` (default) | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY`, `OPENROUTER_LLM_MODEL` |
| OpenCode | `opencode` | `https://opencode.ai/zen/go/v1` | `OPENCODE_API_KEY`, `OPENCODE_LLM_MODEL` |

