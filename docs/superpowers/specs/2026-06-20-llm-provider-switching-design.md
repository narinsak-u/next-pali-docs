# LLM Provider Switching — Design Spec

## Summary

Replace the hardcoded OpenRouter client with a provider-agnostic factory that
switches between `openrouter` and `opencode` based on `PROVIDER_NAME` env var,
enabling rate-limit fallback across two LLM gateways.

## Motivation

The current code uses a single `PROVIDER_API_KEY` + `LLM_MODEL` env var pair
and a hardcoded OpenRouter base URL. To handle rate limits we need to switch
between two providers without code changes.

## Provider Config

| Provider | `name` | `baseURL` | API key env | Model env |
|---|---|---|---|---|
| `openrouter` (default) | `openrouter` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | `OPENROUTER_LLM_MODEL` |
| `opencode` | `opencode` | `https://opencode.ai/zen/go/v1` | `OPENCODE_API_KEY` | `OPENCODE_LLM_MODEL` |

`PROVIDER_NAME` is lowercased; unknown values fall back to `openrouter`.

## Files Changed

### 1. `lib/services/openrouter-client.ts` → `lib/services/llm-provider.ts`

- Reads `PROVIDER_NAME` at module init
- Selects the right config map entry
- Calls `createOpenAICompatible` once with the selected config
- Exports `llm` (the provider factory) and `getDefaultModel()` helper
- Old file deleted

### 2. `app/api/question/route.ts`

- Import `{ llm, getDefaultModel }` instead of `{ openrouter }`
- Replace `openrouter(process.env.LLM_MODEL ?? ...)` → `llm(getDefaultModel())`

### 3. `lib/services/quiz-generator.ts`

- Same import + usage change as question route

### 4. `.env.example`

- Replace generic `PROVIDER_API_KEY` / `LLM_MODEL` with the two provider sections
- Add `PROVIDER_NAME` documentation

## Not Changed

- No client-side changes (hooks use API routes, not direct provider access)
- No quiz-pipeline / rag-pipeline changes (they depend on quiz-generator, which uses the provider)
- No new dependencies (both providers use existing `@ai-sdk/openai-compatible`)
