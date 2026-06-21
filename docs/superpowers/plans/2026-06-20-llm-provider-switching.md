# LLM Provider Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded OpenRouter client with a provider-agnostic factory that switches between `openrouter` and `opencode` based on `PROVIDER_NAME` env var.

**Architecture:** Both providers use `createOpenAICompatible` from `@ai-sdk/openai-compatible` — only `baseURL`, `name`, and env vars differ. A single factory file reads `PROVIDER_NAME` at module init and selects the right config.

**Tech Stack:** `@ai-sdk/openai-compatible`, Vercel AI SDK, Next.js API routes

---

### Task 1: Create `lib/services/llm-provider.ts`

**Files:**
- Create: `lib/services/llm-provider.ts`
- Delete: `lib/services/openrouter-client.ts`

- [ ] **Step 1: Write `llm-provider.ts`**

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const providerName = (
  process.env.PROVIDER_NAME ?? "openrouter"
).toLowerCase();

const config =
  providerName === "opencode"
    ? {
        name: "opencode",
        baseURL: "https://opencode.ai/zen/go/v1",
        apiKey: process.env.OPENCODE_API_KEY,
      }
    : {
        name: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY,
      };

export const llm = createOpenAICompatible({
  name: config.name,
  baseURL: config.baseURL,
  apiKey: config.apiKey,
});

export function getDefaultModel(): string {
  return providerName === "opencode"
    ? (process.env.OPENCODE_LLM_MODEL ?? "google/gemma-4-31b-it:free")
    : (process.env.OPENROUTER_LLM_MODEL ?? "google/gemma-4-31b-it:free");
}
```

- [ ] **Step 2: Delete `lib/services/openrouter-client.ts`**

Run: `del lib\services\openrouter-client.ts`

### Task 2: Update `app/api/question/route.ts`

**Files:**
- Modify: `app/api/question/route.ts`

- [ ] **Step 1: Update imports and usage**

Replace:
```ts
import { openrouter } from "@/lib/services/openrouter-client";
```
With:
```ts
import { llm, getDefaultModel } from "@/lib/services/llm-provider";
```

Replace:
```ts
model: openrouter(
  process.env.LLM_MODEL ?? "google/gemma-4-31b-it:free",
),
```
With:
```ts
model: llm(getDefaultModel()),
```

### Task 3: Update `lib/services/quiz-generator.ts`

**Files:**
- Modify: `lib/services/quiz-generator.ts`

- [ ] **Step 1: Update imports and usage**

Replace:
```ts
import { openrouter } from "@/lib/services/openrouter-client";
```
With:
```ts
import { llm, getDefaultModel } from "@/lib/services/llm-provider";
```

Replace:
```ts
model: openrouter(process.env.LLM_MODEL ?? "google/gemma-4-31b-it:free"),
```
With:
```ts
model: llm(getDefaultModel()),
```

### Task 4: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Replace OpenRouter section with provider-agnostic docs**

Replace:
```env
# ── OpenRouter (LLM Gateway) ──────────────
# Required for AI chat, quiz generation, and follow-up suggestions.
# Sign up: https://openrouter.ai
# Set either PROVIDER_API_KEY or OPENAI_API_KEY (both map to same value).
PROVIDER_API_KEY=
# Optional: override the default LLM model (default: google/gemma-4-31b-it:free)
LLM_MODEL=
```

With:
```env
# ── LLM Provider ───────────────────────────
# Required for AI chat, quiz generation, and follow-up suggestions.
# Set PROVIDER_NAME to "openrouter" (default) or "opencode".
PROVIDER_NAME=

# OpenRouter (default): https://openrouter.ai
OPENROUTER_API_KEY=
OPENROUTER_LLM_MODEL=

# OpenCode (OpenAI-compatible): https://opencode.ai
OPENCODE_API_KEY=
OPENCODE_LLM_MODEL=
```

### Task 5: Verify

- [ ] **Step 1: Run build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.
