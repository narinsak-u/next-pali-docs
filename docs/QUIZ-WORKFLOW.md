# Quiz Workflow

## Overview

The quiz feature generates multiple-choice Pali grammar questions dynamically via AI. A user selects a topic, the system retrieves relevant textbook context from Pinecone, and an LLM generates questions tailored to that context. Questions are answered under a countdown timer, and results are displayed with scoring.

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
              │ POST /api/quiz
              ▼
        API Route (app/api/quiz/route.ts)
              │
              │ quizAction(input)
              ▼
        Server Action (actions/quiz.ts)
              │ zod validation
              ▼
        generateQuiz (lib/services/quiz-pipeline.ts)
              │
              ├── generateEmbedding(topics)
              ├── queryPinecone(vector, topK=10)
              ├── formatContext(matches)
              └── generateQuizResponse({ topics, amount, context })
                     │
                     │ streamObject(gpt-4o-mini)
                     ▼
               Structured quiz response streams back
              │
              ▼
        useQuizAI.object updates
              │
              ▼
        mapQuestionsFromResponse(raw → Question[])
              │
              ▼
        useQuizFlow → "quiz"
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
| `useQuizAI` | `lib/hooks/use-quiz-ai.ts` | LLM interaction via `useObject` |
| `useQuizStats` | `lib/hooks/use-quiz-stats.ts` | Computed stats (progress, score) via `getStats()` |

On `startQuiz(topicId)`:

1. `useQuizData.setTopic(topicId)` — stores selected topic
2. `useQuizFlow.start()` — sets state to `"loading"`
3. `useQuizUI.reset()` — resets pagination to page 1
4. `useQuizData.clearAnswers()` — clears previous answers
5. `useQuizAI.submit({ amount, topics })` — fires AI request

### 3. AI Question Generation (useQuizAI → API → Pipeline)

**Client side** — `useQuizAI` (`lib/hooks/use-quiz-ai.ts`) uses `experimental_useObject` from `@ai-sdk/react`:

```ts
const { object, submit, isLoading, error } = useObject({
  api: "/api/quiz",
  schema: quizResponseSchema,
});
```

This sends a POST to `/api/quiz` with `{ topics: string[], amount: number }` and expects a structured stream matching `quizResponseSchema`.

**API Route** (`app/api/quiz/route.ts`):
- Parses JSON body, delegates to `quizAction` server action
- Handles errors with Thai messages for quota (429) and generic errors

**Server Action** (`actions/quiz.ts`):
- Validates input with `quizSchema` (Zod: `{ topics: z.array(z.string()), amount: z.number() }`)
- Calls `generateQuiz()` from the pipeline
- Detects quota errors via `isQuotaError()`

**Pipeline** (`lib/services/quiz-pipeline.ts`):

```
generateQuiz(input)
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
  └── generateQuizResponse({ topics, amount, context })
        │
        └── streamObject({
              model: openai("gpt-4o-mini"),
              schema: quizResponseSchema,
              prompt: `
                Using this context as reference: ${context}
                Generate ${amount} multiple-choice questions about ${topics}.
                ...
                Translate all questions, answers, and options to Thai language.
              `
            })
              │
              └── toTextStreamResponse()
```

**Generator** (`lib/services/quiz-generator.ts`):
- Uses `streamObject` from the `ai` SDK with the same OpenRouter model as RAG chat (default: `google/gemma-4-31b-it:free`, configurable via `LLM_MODEL`)
- Output is validated against `quizResponseSchema` (Zod):
  ```ts
  { questions: Array<{
      question: string,   // question text
      answer: string,     // correct answer (max 15 words)
      option1: string,    // wrong option 1 (max 15 words)
      option2: string,    // wrong option 2
      option3: string,    // wrong option 3
  }> }
  ```
- Response streams back to the client as structured chunks

### 4. Question Mapping

When `useQuizAI.object` receives data, the orchestrator's `useEffect` triggers:

```ts
const mappedQuestions = mapQuestionsFromResponse(ai.object.questions);
data.setQuestions(mappedQuestions);
flow.goToQuiz();
```

`mapQuestionsFromResponse` (`helpers/map-questions.ts`) transforms each raw question:
- Creates `id` from `questionText + index`
- Shuffles the 4 options randomly
- Creates option `id` from `text + questionText`
- Sets `answerId` as the correct answer's computed id
- Filters out entries with missing `question` or `answer` fields

### 5. Quiz State (QuizState)

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

### 6. Answer Selection

`useQuizData.answer(questionId, optionId)` updates the answers map:
```ts
answers = { "q1": "TruthWhat is sacca?", "q2": "time-expired", ... }
```

`useQuizStats` computes live stats via `getStats()` (`helpers/get-stats.ts`):
- `answeredQuestionsCount` — keys in answers map
- `progressPercentage` — answered / total × 100
- `allQuestionsAnswered` — answered === total
- `score` — correct count (matching `answerId`), total, percentage

### 7. Submission

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

### 8. Results (ResultState)

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
| `app/(home)/quiz/components/LoadingOverlay.tsx` | AI generation loading screen |
| `app/(home)/quiz/components/Disclaimer.tsx` | Disclaimer footer |
| `hooks/use-quiz.ts` | Orchestrator hook |
| `lib/hooks/use-quiz-flow.ts` | App state machine |
| `lib/hooks/use-quiz-data.ts` | Quiz data state |
| `lib/hooks/use-quiz-ui.ts` | UI state (page, completed, expired) |
| `lib/hooks/use-quiz-ai.ts` | AI question generation hook |
| `lib/hooks/use-quiz-stats.ts` | Live scoring/progress computation |
| `lib/services/quiz-pipeline.ts` | RAG pipeline for quiz generation |
| `lib/services/quiz-generator.ts` | LLM call via `streamObject` (gpt-4o-mini) |
| `lib/schemas/quiz.ts` | Zod schemas (`quizSchema`, `quizResponseSchema`) |
| `actions/quiz.ts` | Server action (validation + pipeline call) |
| `app/api/quiz/route.ts` | API route (error handling) |
| `data/quiz-topic.tsx` | Topic definitions with keywords |
| `helpers/map-questions.ts` | Raw → `Question[]` transformation |
| `helpers/get-stats.ts` | Score and progress computation |

## App States

| State | Component | Description |
|-------|-----------|-------------|
| `home` | `HomeState` | Topic selection grid |
| `loading` | `LoadingOverlay` | Animated progress bar while AI generates questions |
| `quiz` | `QuizState` | Questions, timer, pagination |
| `results` | `ResultState` | Score and answer review |

## Environment Variables

| Variable | Used By |
|----------|---------|
| `PINECONE_API_KEY` | Vector store query for context retrieval |
| `PINECONE_INDEX_NAME` | Pinecone index |
| `PINECONE_NAMESPACE` | Pinecone namespace |
| `PROVIDER_API_KEY` | OpenRouter/OpenAI API key |

## Models

| Model | Provider | Used For |
|-------|----------|----------|
| `llama-text-embed-v2` | Pinecone Inference | Embedding topics for vector search |
| `google/gemma-4-31b-it:free` | OpenRouter (via `LLM_MODEL` env var) | Generating quiz questions via `streamObject` |

## Dependencies

The quiz pipeline uses dependency injection via `QuizPipelineDeps`:

```ts
interface QuizPipelineDeps {
  embedding?: EmbeddingPort;
  vectorStore?: VectorStorePort;
  quizGenerator?: QuizGeneratorPort;
}
```

Each port wraps a real implementation as default, allowing tests to inject mocks.
