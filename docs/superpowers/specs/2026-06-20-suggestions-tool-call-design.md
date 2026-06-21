# Suggestions via Tool Call — Design

## Problem

`generateSuggestions` makes a separate `generateText` call after the answer stream ends. This is slow, expensive, and unreliable — the model may not support structured output (`experimental_output`) via OpenRouter.

## Solution

Add a `suggestQuestions` tool that the model calls inline during step 2 (the answer step). The tool input IS the suggestions; the handler writes `data-suggestions` directly to the stream. No separate LLM call needed.

## Flow

| Step | What happens |
|------|-------------|
| 1 | Model calls `searchDocs` — tool writes `data-task`/`data-reasoning`, returns matches |
| - | `prepareStep` injects context into system prompt |
| 2 | Model generates answer text AND calls `suggestQuestions` with 3 questions |
| - | Tool handler writes `data-suggestions` event to the stream |
| 3+ | No remaining tool calls → continuation condition fails → stream ends |

## Changes

### `app/api/question/route.ts`

- Add `suggestQuestions` tool definition alongside `searchDocs`.
- Tool input schema: `z.object({ suggestions: z.array(z.string()) })`.
- Handler: writes `{ type: "data-suggestions", data: { suggestions } }` via `writer.write()`. Guards against duplicate calls with a `let` flag.
- Remove `generateSuggestions` import and the post-stream call block (lines 131-144).
- Remove `lastAnswer` tracking (no longer needed for suggestions).
- Remove `lastMatchCount` tracking (remove the variable, keep it only inside the searchDocs execute scope).
- Reduce `stopWhen: stepCountIs(3)` to `stepCountIs(2)` — with inline suggestions we only need 2 steps.

### `lib/chat/pali-system-prompt.ts`

Append instruction:
```
After providing your answer, call the `suggestQuestions` tool with 3 follow-up questions to help the user continue learning. These questions should be short, specific, and grounded in the material you just answered from.
```

### `lib/services/suggestions.ts`

Delete. No longer imported anywhere.

### No changes

- `AIMessage` — already renders `data-suggestions` parts via `SuggestionStep`.
- `SuggestionStep` — no changes needed.
- `ai-data-parts.ts` — `SuggestionsPart` schema stays the same.
- `process-steps-inline.tsx`, `process-details.tsx`, `process-badge.tsx` — tool events (`tool-input-*`/`tool-output-*`) are not rendered by `AIMessage`, so the tool call is invisible to the user.

## Error handling

- If the model does NOT call `suggestQuestions`: no suggestions appear (same as current behavior when the separate call fails). Graceful degradation.
- If `suggestQuestions` is called multiple times: the duplicate guard silently returns `{ ok: false }` without writing duplicate events.
- If `suggestions` array is empty: the handler checks length and skips the write.

## Edge cases

- **No search needed** (user asks a greeting, model doesn't call `searchDocs`): step 1 ends, no continuation (no tool calls → no step 2). No suggestions generated. This is correct — no context to base suggestions on.
- **Search returns 0 matches**: `prepareStep` returns `undefined` (no context injection). Step 2 still runs (model called `searchDocs`). Model may still generate suggestions from general knowledge. This is fine.
- **Model calls `suggestQuestions` but not `searchDocs`**: Unlikely given the system prompt instructs search first. But if it happens, `suggestQuestions` writes suggestions in step 1, and the continuation check sees no tool calls to execute → stream ends. Suggestions appear without a separate answer — unlikely to be useful in practice.

## Testing

- Update `tests/route.test.ts`:
  - Remove the two suggestions-specific tests (no longer applicable — the second LLM call no longer exists).
  - Add a test that verifies `suggestQuestions` tool is defined with correct schema.
  - Add a test that calling `suggestQuestions.execute` writes `data-suggestions` event and ignores duplicates.
  - Remove `tests/suggestions.test.ts` (file deleted — tests for removed `generateSuggestions` function).
  - `lastAnswer`/`lastMatchCount` tracking is no longer needed outside the searchDocs scope — simplify.
