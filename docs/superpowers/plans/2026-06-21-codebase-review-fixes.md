# Codebase Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address the 4 real bugs, key composition/performance issues, and high-impact refactors identified in the codebase review of next-pali-docs.

**Architecture:** Apply targeted fixes grouped into 6 phases. Each phase produces a working, testable state. Preserve all existing functionality. Follow the project's existing conventions (double quotes, named exports, `cn()` for classes, `cva` for variants, sub-hook composition pattern).

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, Radix UI, Vitest v4 (jsdom), Zod, AI SDK 5.

**Reference review:** `docs/superpowers/plans/2026-06-21-codebase-review-findings.md` (this directory).

**Baseline React Doctor score:** 66/100 (17 warnings, 4 real issues). Target: 90+ with all critical issues resolved.

---

## File Structure

### Files to Modify
- `components/ai/chat-input.tsx` — add `type="button"` (Tasks 1)
- `components/ai/process-badge.tsx` — add `aria-label` (Task 2)
- `components/ai/ai-message.tsx` — fix `array.find()` in loop + move `isDataPart` export (Tasks 3-4)
- `app/api/question/route.ts` — Edge runtime + shared `isQuotaError` (Tasks 5-6)
- `app/api/quiz/route.ts` — Edge runtime + shared `isQuotaError` (Tasks 5-6)
- `lib/hooks/use-quiz-ai.ts` — `useReducer` + `requestIdRef` (Task 7)
- `app/(home)/question/QuestionClient.tsx` — `useRef` for consumed IDs (Task 8)
- `hooks/use-quiz.ts` — move `window.scrollTo` to event handlers (Task 9)
- `components/CustomAlert.tsx` — re-export from `ui/alert` (Task 10)
- `app/docs/[[...slug]]/page.tsx` — `React.cache` for `source.getPage` (Task 11)
- `lib/services/embedding.ts` — use `lru-cache` (Task 12)

### Files to Create
- `lib/chat/message-parts.ts` — new home for `isDataPart` helper (Task 4)
- `lib/hooks/use-quiz-ai-reducer.ts` — `useReducer` for quiz AI state (Task 7) — actually inline in `use-quiz-ai.ts`

---

## Phase 1: Real Bugs (Quick Wins)

### Task 1: Fix `<button>` missing `type` in ChatInput

**Files:**
- Modify: `components/ai/chat-input.tsx:39, 49`

- [ ] **Step 1: Add `type="button"` to Regenerate button**

Open `components/ai/chat-input.tsx`. At line 39, the Regenerate `<button>` is missing `type`. Without it, the button defaults to `type="submit"` inside the form and triggers a chat submit when clicked.

Change:
```tsx
<button
  onClick={props.onRegenerate}
  className="..."
>
  <RotateCcw aria-hidden />
  <span>Regenerate</span>
</button>
```

To:
```tsx
<button
  type="button"
  onClick={props.onRegenerate}
  className="..."
>
  <RotateCcw aria-hidden />
  <span>Regenerate</span>
</button>
```

- [ ] **Step 2: Add `type="button"` to Clear button**

At line 49, same fix:
```tsx
<button
  type="button"
  onClick={props.onClear}
  className="..."
>
  <Trash2 aria-hidden />
  <span>Clear</span>
</button>
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit` (or `next build` if tsc is unavailable)
Expected: No type errors. The `type` prop is already in the button attributes the project uses; no type changes needed.

- [ ] **Step 4: Manual smoke test**

Run `npm run dev`, navigate to `/question`, type a message, send it, then click Regenerate and Clear. Each should perform its action without submitting the form (i.e., not send empty input).

- [ ] **Step 5: Commit**

```bash
git add components/ai/chat-input.tsx
git commit -m "fix(chat-input): set type=button on Regenerate and Clear"
```

---

### Task 2: Add `aria-label` to process-badge dialog

**Files:**
- Modify: `components/ai/process-badge.tsx:50`

- [ ] **Step 1: Locate the `role="dialog"` element**

Open `components/ai/process-badge.tsx`. The element at line 50 is the popover panel:
```tsx
<div
  data-testid="process-badge-popover"
  role="dialog"
  className="..."
>
```

- [ ] **Step 2: Add `aria-label`**

Change to:
```tsx
<div
  data-testid="process-badge-popover"
  role="dialog"
  aria-label="Process details"
  className="..."
>
```

- [ ] **Step 3: Commit**

```bash
git add components/ai/process-badge.tsx
git commit -m "fix(process-badge): add aria-label to dialog for screen readers"
```

---

### Task 3: Replace `array.find()` in loop with `Map` lookup

**Files:**
- Modify: `components/ai/ai-message.tsx:39-98`

The `seenTaskIds` Set already exists. Extend it to a `Map<id, latestTaskPart>` so we can both dedupe AND look up in O(1).

- [ ] **Step 1: Read current logic**

Open `components/ai/ai-message.tsx:39-98`. Find the loop that builds `taskPartsLatest`. It currently uses:
```tsx
const taskPartsLatest: TaskPart[] = [];
const seenTaskIds = new Set<string>();

for (const p of parts) {
  if (p.type === "data-task") {
    const data = p.data as TaskPartData;
    if (data.id && seenTaskIds.has(data.id)) {
      // Update existing
      const existing = taskPartsLatest.find((t) => t.data.id === data.id);
      if (existing) {
        existing.data = { ...existing.data, status: data.status };
      }
    } else if (data.id) {
      seenTaskIds.add(data.id);
      taskPartsLatest.push(p as TaskPart);
    }
  }
  // ...
}
```

- [ ] **Step 2: Refactor to use Map for O(1) lookup**

Change the loop block (replace `seenTaskIds` + `taskPartsLatest` initialization and the inner branch):

```tsx
const taskPartsLatest: TaskPart[] = [];
const taskById = new Map<string, TaskPart>();

for (const p of parts) {
  if (p.type === "data-task") {
    const data = p.data as TaskPartData;
    if (data.id) {
      const existing = taskById.get(data.id);
      if (existing) {
        existing.data = { ...existing.data, status: data.status };
      } else {
        const fresh = p as TaskPart;
        taskById.set(data.id, fresh);
        taskPartsLatest.push(fresh);
      }
    }
  }
  // ... rest of loop unchanged
}
```

Remove the `seenTaskIds` declaration (no longer used).

- [ ] **Step 3: Verify no type errors**

Run: `npx tsc --noEmit` (or `next build`)
Expected: No errors. `TaskPart` type is already imported.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, send a multi-step chat. Confirm task list still updates correctly when a task transitions to a new status (e.g., "pending" → "complete").

- [ ] **Step 5: Commit**

```bash
git add components/ai/ai-message.tsx
git commit -m "perf(ai-message): use Map for O(1) task lookup instead of array.find"
```

---

### Task 4: Move `isDataPart` out of component file

**Files:**
- Create: `lib/chat/message-parts.ts`
- Modify: `components/ai/ai-message.tsx:137`
- Modify: any importers of `isDataPart` (search first)

- [ ] **Step 1: Find all importers of `isDataPart`**

Run:
```bash
grep -rn "isDataPart" --include="*.ts" --include="*.tsx" .
```

Note the importers. Likely `components/ai/index.tsx` or one of the step components.

- [ ] **Step 2: Create `lib/chat/message-parts.ts`**

```ts
import type { DataUIPart, UIMessage } from "ai";

export function isDataPart<P extends DataUIPart["type"]>(
  part: UIMessage["parts"][number] | undefined,
  type: P,
): part is Extract<UIMessage["parts"][number], { type: `data-${P}` }> {
  return part?.type === `data-${type}`;
}
```

(Move the exact signature from `ai-message.tsx` to preserve the type contract.)

- [ ] **Step 3: Update `ai-message.tsx` to import instead of export**

In `components/ai/ai-message.tsx`:
1. Add import at top: `import { isDataPart } from "@/lib/chat/message-parts";`
2. Remove the bottom-of-file `export { isDataPart };` (line ~137).

- [ ] **Step 4: Update other importers**

For each file found in Step 1 that imported `isDataPart` from `ai-message.tsx`, change the import to `from "@/lib/chat/message-parts"`.

- [ ] **Step 5: Verify build**

Run: `next build` (per AGENTS.md, this is the typecheck command)
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add lib/chat/message-parts.ts components/ai/ai-message.tsx [other modified importers]
git commit -m "refactor(ai-message): move isDataPart helper to lib/chat/message-parts"
```

---

## Phase 2: API Route Improvements

### Task 5: Switch AI routes to Edge runtime

**Files:**
- Modify: `app/api/question/route.ts:15`
- Modify: `app/api/quiz/route.ts:5`

- [ ] **Step 1: Verify Edge compatibility**

Before changing, confirm Pinecone + AI SDK are edge-compatible in this project:
- `@pinecone-database/pinecone: ^6.1.3` — supports edge (uses fetch)
- `ai: ^5.0.12` — edge compatible
- `@ai-sdk/openai-compatible: ^1.0.41` — edge compatible

If any dependency uses Node-only APIs, skip this task and document why.

- [ ] **Step 2: Update question route runtime**

Open `app/api/question/route.ts`. Around line 15, change:
```ts
export const runtime = "nodejs";
```
to:
```ts
export const runtime = "edge";
```

- [ ] **Step 3: Update quiz route runtime**

Open `app/api/quiz/route.ts`. Add at the top of the file (after imports):
```ts
export const runtime = "edge";
```

- [ ] **Step 4: Verify build**

Run: `next build`
Expected: Build succeeds. If it fails with "edge runtime does not support X", revert and add a comment.

- [ ] **Step 5: Manual smoke test**

Run `npm run dev`. Send a chat message and start a quiz. Both should work end-to-end. Check response times are not degraded.

- [ ] **Step 6: Commit**

```bash
git add app/api/question/route.ts app/api/quiz/route.ts
git commit -m "perf(api): switch question and quiz routes to edge runtime"
```

---

### Task 6: Deduplicate `isQuotaError`

**Files:**
- Modify: `app/api/question/route.ts:44-47` (or wherever local definition is)
- Modify: `app/api/quiz/route.ts:44-47` (or wherever local definition is)
- Source: `lib/services/quiz-pipeline.ts:192`

- [ ] **Step 1: Read the three `isQuotaError` definitions**

Read:
- `lib/services/quiz-pipeline.ts:192` (canonical)
- `app/api/question/route.ts:44` (local)
- `app/api/quiz/route.ts:44` (local)

Confirm they are functionally identical. If they differ, preserve the canonical implementation.

- [ ] **Step 2: Export from `quiz-pipeline.ts`**

In `lib/services/quiz-pipeline.ts`, ensure `isQuotaError` has an `export` keyword. If it's already exported, no change needed.

- [ ] **Step 3: Update question route**

In `app/api/question/route.ts`:
1. Delete the local `isQuotaError` function (lines 44-47)
2. Add at top: `import { isQuotaError } from "@/lib/services/quiz-pipeline";`

- [ ] **Step 4: Update quiz route**

In `app/api/quiz/route.ts`:
1. Delete the local `isQuotaError` function (lines 44-47)
2. Add at top: `import { isQuotaError } from "@/lib/services/quiz-pipeline";`

- [ ] **Step 5: Verify build**

Run: `next build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add lib/services/quiz-pipeline.ts app/api/question/route.ts app/api/quiz/route.ts
git commit -m "refactor(api): deduplicate isQuotaError by importing from quiz-pipeline"
```

---

## Phase 3: State Management Fixes

### Task 7: Convert `use-quiz-ai` to `useReducer` + add requestId

**Files:**
- Modify: `lib/hooks/use-quiz-ai.ts`

The current file has 4 coupled `useState` calls (`phase`, `matchCount`, `questions`, `error`). Plus a race condition where late stream events can clobber state after `abort()`.

- [ ] **Step 1: Add new types at the top**

```ts
import { useEffect, useReducer, useRef } from "react";
// ... existing imports

type QuizAiState = {
  phase: Phase;
  matchCount: number;
  questions: Question[];
  error: string | null;
};

type QuizAiAction =
  | { type: "RESET" }
  | { type: "SET_MATCHES"; count: number }
  | { type: "SET_QUESTIONS"; questions: Question[] }
  | { type: "APPEND_QUESTIONS"; questions: Question[] }
  | { type: "SET_PHASE"; phase: Phase }
  | { type: "SET_ERROR"; error: string | null };

const initialState: QuizAiState = {
  phase: "idle",
  matchCount: 0,
  questions: [],
  error: null,
};

function quizAiReducer(state: QuizAiState, action: QuizAiAction): QuizAiState {
  switch (action.type) {
    case "RESET":
      return initialState;
    case "SET_MATCHES":
      return { ...state, matchCount: action.count };
    case "SET_QUESTIONS":
      return { ...state, questions: action.questions };
    case "APPEND_QUESTIONS":
      return { ...state, questions: [...state.questions, ...action.questions] };
    case "SET_PHASE":
      return { ...state, phase: action.phase };
    case "SET_ERROR":
      return { ...state, error: action.error };
  }
}
```

- [ ] **Step 2: Replace `useState` calls with `useReducer`**

Find all four `useState` lines (phase, matchCount, questions, error). Replace with:
```ts
const [state, dispatch] = useReducer(quizAiReducer, initialState);
```

- [ ] **Step 3: Add `requestIdRef`**

Add a ref to detect stale stream events:
```ts
const requestIdRef = useRef(0);
```

- [ ] **Step 4: Bump `requestIdRef` at start of `submit`**

In the `submit` callback, at the very top (before any state mutation):
```ts
const reqId = ++requestIdRef.current;
```

- [ ] **Step 5: Replace all `setPhase(...)`, `setQuestions(...)`, etc. with `dispatch`**

Map the old setters to actions:
- `setPhase(x)` → `dispatch({ type: "SET_PHASE", phase: x })`
- `setMatchCount(x)` → `dispatch({ type: "SET_MATCHES", count: x })`
- `setQuestions([])` (reset) → `dispatch({ type: "RESET" })`
- `setQuestions(q)` (replace) → `dispatch({ type: "SET_QUESTIONS", questions: q })`
- `[...prev, ...more]` (append) → `dispatch({ type: "APPEND_QUESTIONS", questions: more })`
- `setError(x)` → `dispatch({ type: "SET_ERROR", error: x })`

- [ ] **Step 6: Guard stream switch with requestId**

Find the streaming switch (e.g., `for (const part of ...) { switch (part.type) {...} }`). At the top of the loop:
```ts
if (requestIdRef.current !== reqId) break;
```

- [ ] **Step 7: Update return object**

Change all references from `phase`, `matchCount`, `questions`, `error` to `state.phase`, `state.matchCount`, `state.questions`, `state.error`.

- [ ] **Step 8: Verify build + run tests**

Run:
```bash
npm run test:run
next build
```

Expected: All existing tests pass; build succeeds.

- [ ] **Step 9: Commit**

```bash
git add lib/hooks/use-quiz-ai.ts
git commit -m "refactor(use-quiz-ai): useReducer for coupled state + requestId for race safety"
```

---

### Task 8: Replace `useState<Set>` with `useRef<Set>` in QuestionClient

**Files:**
- Modify: `app/(home)/question/QuestionClient.tsx:14-19`

The `consumedSuggestionMsgIds` Set is mutated on every suggestion click and re-renders all `AIMessage` components. It's transient, doesn't drive UI directly, so it belongs in a ref.

- [ ] **Step 1: Read current usage**

Open `app/(home)/question/QuestionClient.tsx:14-19`. Find the `useState<Set<string>>` and the `new Set(prev).add(...)` mutation at line ~87.

- [ ] **Step 2: Convert to `useRef`**

Change:
```ts
const [consumedSuggestionMsgIds, setConsumedSuggestionMsgIds] = useState<Set<string>>(new Set());
```

To:
```ts
const consumedSuggestionMsgIdsRef = useRef<Set<string>>(new Set());
```

- [ ] **Step 3: Update mutation site**

Find the line that does `setConsumedSuggestionMsgIds((prev) => new Set(prev).add(...))`. Replace with:
```ts
consumedSuggestionMsgIdsRef.current.add(id);
```

(Direct mutation is OK because the ref's Set is never read during render — only inside `onSelectSuggestion` callbacks.)

- [ ] **Step 4: Update reads**

If `consumedSuggestionMsgIds` is read in any prop-passing or condition, replace with `consumedSuggestionMsgIdsRef.current` (and pass through a callback so consumers can call `.has()` on it).

- [ ] **Step 5: Verify build + smoke test**

Run: `next build` + `npm run dev` + click suggestions multiple times. Confirm suggestions are still marked consumed (the `onSelectSuggestion` callback uses the ref).

- [ ] **Step 6: Commit**

```bash
git add app/(home)/question/QuestionClient.tsx
git commit -m "perf(question-client): useRef for consumed suggestion IDs to avoid re-render cascade"
```

---

## Phase 4: Effect → Event Refactor

### Task 9: Move `window.scrollTo` from useEffect to event handlers

**Files:**
- Modify: `hooks/use-quiz.ts:129-133`

`window.scrollTo` in a `useEffect` causes extra renders. Move into the handlers that change page state.

- [ ] **Step 1: Read the effect**

Open `hooks/use-quiz.ts:129-133`. Find the `useEffect(() => { window.scrollTo(...); }, [...])`.

- [ ] **Step 2: Locate the triggers**

Identify the callback(s) that change the dep (likely `goToPage`, `goToResults`, `goToHome` in `lib/hooks/use-quiz-flow.ts` or `use-quiz-ui.ts`).

- [ ] **Step 3: Remove the useEffect**

Delete the `useEffect` block. Remove its `useEffect` import if no longer used in this file.

- [ ] **Step 4: Add `window.scrollTo` to handlers**

In each handler that needs it, after the state update, add:
```ts
window.scrollTo({ top: 0, behavior: "smooth" });
```

- [ ] **Step 5: Verify build + tests**

Run: `npm run test:run && next build`
Expected: All pass.

- [ ] **Step 6: Smoke test**

Run `npm run dev`, start a quiz, navigate between pages, confirm smooth scroll-to-top on each transition.

- [ ] **Step 7: Commit**

```bash
git add hooks/use-quiz.ts lib/hooks/use-quiz-flow.ts lib/hooks/use-quiz-ui.ts
git commit -m "refactor(quiz): move window.scrollTo from effect to event handlers"
```

---

## Phase 5: Cleanup

### Task 10: Fold `CustomAlert` into `ui/alert`

**Files:**
- Modify: `components/CustomAlert.tsx` (delete or re-export)
- Modify: importers of `CustomAlert`

- [ ] **Step 1: Find importers**

Run: `grep -rn "CustomAlert" --include="*.ts" --include="*.tsx" .`
Note all importers.

- [ ] **Step 2: Read both APIs**

Read `components/CustomAlert.tsx` and `components/ui/alert.tsx`. Confirm the `ui/alert` `Alert` component supports the same usage. If `CustomAlert` has unique styling, copy the classNames into a variant of `ui/alert`.

- [ ] **Step 3: Update importers**

Change `import { AlertDemo } from "@/components/CustomAlert"` → `import { Alert } from "@/components/ui/alert"`.

- [ ] **Step 4: Delete `CustomAlert.tsx`**

```bash
rm components/CustomAlert.tsx
```

- [ ] **Step 5: Verify build**

Run: `next build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add components/CustomAlert.tsx components/ui/alert.tsx [importer files]
git commit -m "refactor(alert): remove duplicate CustomAlert, use ui/alert"
```

---

### Task 11: Cache `source.getPage` with `React.cache`

**Files:**
- Modify: `app/docs/[[...slug]]/page.tsx:18, 21, 80-82`
- Modify: `app/(home)/blog/[slug]/page.tsx` (if similar pattern)

`source.getPage(slug)` runs once in the page component and again in `generateMetadata`. Wrap in `React.cache` to dedupe per request.

- [ ] **Step 1: Add cached wrapper in `lib/source.ts`**

Open `lib/source.ts`. Add at the bottom:
```ts
import { cache } from "react";

export const getCachedPage = cache(async (slug: string[]) => {
  return source.getPage(slug);
});
```

(Or follow whatever pattern `lib/source.ts` already exports — extend it minimally.)

- [ ] **Step 2: Update docs page**

In `app/docs/[[...slug]]/page.tsx`:
- Replace `source.getPage(params.slug)` with `getCachedPage(params.slug)` in both the page and `generateMetadata` functions.

- [ ] **Step 3: Update blog page (if applicable)**

If `app/(home)/blog/[slug]/page.tsx` has the same pattern, do the same.

- [ ] **Step 4: Verify build + smoke test**

Run: `next build && npm run dev`
Expected: Build succeeds. Docs and blog pages render correctly. View source — should not show duplicate queries.

- [ ] **Step 5: Commit**

```bash
git add lib/source.ts app/docs/[[...slug]]/page.tsx app/(home)/blog/[slug]/page.tsx
git commit -m "perf(source): cache source.getPage lookups per request with React.cache"
```

---

### Task 12: Use `lru-cache` in embedding service

**Files:**
- Modify: `lib/services/embedding.ts`

Current implementation uses a plain `Map` with refresh-on-access (LRU-ish) but FIFO eviction — inconsistent.

- [ ] **Step 1: Install `lru-cache`**

Run: `npm install lru-cache`
Check `package.json` after install to confirm it's in `dependencies`.

- [ ] **Step 2: Read current code**

Open `lib/services/embedding.ts:6-30`. Read the current `getCached` and eviction logic.

- [ ] **Step 3: Replace with `lru-cache`**

```ts
import { LRUCache } from "lru-cache";

const embeddingCache = new LRUCache<string, Awaited<ReturnType<typeof generateEmbedding>>>({
  max: 100,
  ttl: 1000 * 60 * 60, // 1 hour
});

export async function getCachedEmbedding(text: string) {
  if (embeddingCache.has(text)) {
    return embeddingCache.get(text)!;
  }
  const embedding = await generateEmbedding(text);
  embeddingCache.set(text, embedding);
  return embedding;
}
```

- [ ] **Step 4: Verify build + tests**

Run: `npm run test:run && next build`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/services/embedding.ts
git commit -m "perf(embedding): use lru-cache for consistent LRU semantics"
```

---

## Phase 6: Verification

### Task 13: Final verification + React Doctor re-score

- [ ] **Step 1: Run full test suite**

Run: `npm run test:run`
Expected: All tests pass.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 3: Re-run React Doctor**

Run: `npx -y react-doctor@latest . --verbose`
Expected: Score improved from 66/100 to 80+. Remaining warnings are false positives (9 index-key warnings) and the `preventDefault` warning (correct pattern).

- [ ] **Step 4: Final commit (if any cleanup needed)**

```bash
git status
# If any uncommitted changes:
git add -A
git commit -m "chore: cleanup after codebase review fixes"
```

---

## Self-Review Checklist

- [x] Each task has exact file paths
- [x] Each code change shows the actual code (no "TBD" or "similar to")
- [x] Each task has explicit verification step (build/test/smoke)
- [x] Each task has a commit step
- [x] Tasks are independently valuable (can stop after any phase)
- [x] Type/symbol names match across tasks (`requestIdRef`, `consumedSuggestionMsgIdsRef`, `getCachedPage`)
- [x] AGENTS.md conventions followed: double quotes, named exports, no barrel, cva, cn(), sub-hook composition
- [x] No `useEffect` for data fetching (kept existing pattern, didn't introduce React Query — out of scope)
- [x] Compound component refactor of `AIMessage`/`ChatInput` deliberately excluded (larger, separate plan)

## Out of Scope (Documented for Future Plans)

1. **`AIMessage` → compound component** — larger refactor, deserves its own plan with brainstorming
2. **`ChatInput` → compound with provider** — same
3. **`ResponseStep` variants replacing `isStreaming`** — minor
4. **`lib/source.ts` barrel import from `lucide-react`** — needs icon usage audit
5. **Wrap blog `<Mdx />` in `<Suspense>`** — UX decision (skeleton design)
6. **Server actions auth checks** — depends on auth design
