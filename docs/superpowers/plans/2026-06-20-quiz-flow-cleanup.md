# Quiz Flow Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant server action layer in the quiz flow, clean up fake loading progress, and remove dead code.

**Architecture:** The quiz flow currently chains `useObject hook` → `POST /api/quiz` → `quizAction` server action (called as plain function) → `generateQuiz` pipeline. The server action adds zero value — it's called from an API route as a regular function, so `maxDuration` doesn't apply and error handling is duplicated. We eliminate it by moving Zod validation into the API route and calling `generateQuiz` directly. Separately, the `LoadingOverlay` uses a fake timer-based progress bar that doesn't reflect actual AI loading state — we replace it with an indeterminate spinner. We also remove unreachable `isLoading`/`object` props from `QuizState`.

**Tech Stack:** Next.js App Router, AI SDK (`streamObject`, `useObject`), Zod

---

### Task 1: Remove server action, simplify API route

**Files:**
- Delete: `actions/quiz.ts`
- Modify: `app/api/quiz/route.ts`

The server action (`actions/quiz.ts`) is called as a plain function from the API route — it never runs as an actual server action RPC endpoint. It does two things: Zod validation and quota error detection. Both can live in the API route directly.

- [ ] **Step 1: Delete `actions/quiz.ts`**

Delete the file.

- [ ] **Step 2: Rewrite `app/api/quiz/route.ts`**

The new route validates with Zod inline, calls `generateQuiz` directly, and catches errors with the same Thai messages. Import `isQuotaError` from the pipeline since the server action was the only consumer of `quizSchema` directly.

```ts
import { generateQuiz, isQuotaError } from "@/lib/services/quiz-pipeline";
import { quizSchema } from "@/lib/schemas/quiz";
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const parsed = quizSchema.parse(data);
    return await generateQuiz({ topics: parsed.topics, amount: parsed.amount });
  } catch (error: unknown) {
    console.error("Quiz API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (isQuotaError(error) || message.includes("429")) {
      return NextResponse.json(
        { error: "บริการ AI หมดโควต้าการใช้งาน กรุณาลองใหม่อีกครั้งในภายหลัง" },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการสร้างแบบทดสอบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Run tests to verify nothing is broken**

```bash
npx vitest run
```

Expected: 12 files passed, 67 tests passed.

- [ ] **Step 4: Commit**

```bash
git add app/api/quiz/route.ts actions/quiz.ts
git commit -m "refactor: remove redundant server action from quiz flow"
```

---

### Task 2: Fix fake loading progress bar

**Files:**
- Modify: `app/(home)/quiz/components/LoadingOverlay.tsx`
- Modify: `app/(home)/quiz/components/QuizContents.tsx`

The `LoadingOverlay` animates 0→100% over a fixed 15-second timer regardless of actual AI response speed. The `onComplete` callback is passed as `() => {}` (no-op), so completion is meaningless — the real state transition happens when `ai.object` arrives via `useEffect` in `use-quiz.ts`.

- [ ] **Step 1: Replace fake timer with indeterminate spinner in `LoadingOverlay.tsx`**

Remove `duration`, `progress` state, both `useEffect` hooks. Remove the `onComplete` prop. Show a simple spinning loader instead of the fake progress bar.

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

interface LoadingOverlayProps {
  error?: string | null;
  onRetry?: () => void;
}

export function LoadingOverlay({
  error,
  onRetry,
}: LoadingOverlayProps) {
  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="w-full max-w-lg space-y-4 p-6 text-center">
          <AlertCircle className="size-12 mx-auto text-red-500" />
          <h2 className="text-2xl font-bold text-red-600">เกิดข้อผิดพลาด</h2>
          <p className="text-muted-foreground">{error}</p>
          {onRetry && (
            <Button onClick={onRetry} variant="outline" className="gap-2">
              <RefreshCw className="size-4" />
              ลองอีกครั้ง
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg space-y-4 p-2 text-center">
        <h2 className="text-2xl font-bold">AI กำลังสร้างแบบทดสอบ</h2>
        <p className="text-muted-foreground">
          เตรียมพร้อมสำหรับคำถามที่คัดสรรมาอย่างดี และความท้าทายที่รอคุณอยู่...
        </p>
        <Loader2 className="size-8 mx-auto animate-spin text-primary" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update caller in `QuizContents.tsx`**

Remove `duration` and `onComplete` props from `LoadingOverlay` usage.

In `app/(home)/quiz/components/QuizContents.tsx`, change line 58:
```tsx
return <LoadingOverlay error={getErrorMessage(error)} onRetry={handleRetry} />;
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add app/\(home\)/quiz/components/LoadingOverlay.tsx app/\(home\)/quiz/components/QuizContents.tsx
git commit -m "fix: replace fake timer progress with indeterminate spinner in quiz loading"
```

---

### Task 3: Remove dead props from QuizState

**Files:**
- Modify: `app/(home)/quiz/states/QuizState.tsx`
- Modify: `app/(home)/quiz/components/QuizContents.tsx`

`QuizState` receives `isLoading` and `object` props. `isLoading` is used only for a placeholder text at line 98-101, but `QuizState` is rendered only after `flow.goToQuiz()` fires — which happens when `ai.object` is already populated and `isLoading` is `false`. Both props are dead code.

- [ ] **Step 1: Remove `isLoading` and `object` from `QuizState.tsx`**

Remove from the `Props` type and the destructuring. Remove the `{isLoading && ...}` block.

The `object` prop is not used anywhere in `QuizState` except inside that `isLoading` block, so removing both is safe.

Modified component signature:
```tsx
type Props = {
  selectedTopic: string | null;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  questions: Question[];
  answers: Record<string, string>;
  quizCompleted: boolean;
  timeExpired: boolean;
  allQuestionsAnswered: boolean;
  answeredQuestionsCount: number;
  progressPercentage: number;
  handleTimeUp: () => void;
  handleSelectOption: (questionId: string, optionId: string) => void;
  handleSubmitQuiz: () => void;
};
```

Remove the `{isLoading && (...)}` block (lines 98-101).

Remove `isLoading` from the early-return `QuizTimer` guard — change line 71-78 to:
```tsx
{!quizCompleted && !timeExpired && (
  <QuizTimer
    duration={(topic?.time ?? 0) * 60}
    onTimeUp={handleTimeUp}
  />
)}
```

Wait, actually, looking at the original more carefully:

```tsx
{!isLoading && (
  <QuizTimer
    duration={
      (topic?.time ?? 0) * 60
    }
    onTimeUp={handleTimeUp}
  />
)}
```

This just guards against rendering the timer while loading. Since QuizState is never rendered during loading, we can just always show the timer. But to be safe, let me just remove the `isLoading` variable and keep the timer always visible, since it won't be rendered during loading anyway.

Actually, let me be more careful. The `isLoading` guard might be there as a safety net. Let me keep the timer always visible since it'll never be shown during loading anyway.

- [ ] **Step 2: Stop passing `isLoading` and `object` from `QuizContents.tsx`**

Remove `isLoading` and `object` from the destructured values used for the QuizState render (lines 62-83).

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add app/\(home\)/quiz/states/QuizState.tsx app/\(home\)/quiz/components/QuizContents.tsx
git commit -m "refactor: remove unreachable isLoading and object props from QuizState"
```

---

### Self-Review

**1. Spec coverage:**
- Server action removal ✓ — Task 1 deletes `actions/quiz.ts`, moves logic to route
- Fake progress bar ✓ — Task 2 replaces timer-based progress with spinner
- Dead QuizState props ✓ — Task 3 removes unused `isLoading`/`object`
- All issues from review addressed ✓

**2. Placeholder scan:** No TBD, TODO, or placeholder patterns found.

**3. Type consistency:** The `Props` type change in Task 3 is consistent — `isLoading` and `object` are removed from both the type definition and all call sites. The `LoadingOverlayProps` interface in Task 2 removes `duration` and `onComplete`, and the sole caller passes neither — consistent.
