# Plan: Code Review Fixes

Address critical and high-priority issues identified during the code review to improve reliability, security, and user experience.

## 1. Quiz Engine Improvements

- [x] **Shuffle Options**: Update `helpers/map-questions.ts` to shuffle the question options so the correct answer isn't always at the end.
- [x] **Type Safety**: Replace `any[]` in `mapQuestionsFromResponse` with proper types from `lib/schemas/quiz.ts`.
- [x] **Stability**: Add a safeguard against division-by-zero in `helpers/get-stats.ts`.
- [x] **Streaming Optimization**: Modify `hooks/use-quiz.ts` to allow partial streaming results instead of waiting for `!isLoading`.

## 2. Code Quality & Refactoring

- [x] **Typo Correction**: Rename `quizResponeseSchema` to `quizResponseSchema` in `lib/schemas/quiz.ts` and update all 5+ references across the codebase.
- [x] **Service Cleanup**: Remove the redundant and incorrectly typed `generateQuiz` async generator in `lib/services/quiz-generator.ts`.
- [x] **Search Type Safety**: Remove `any` casts in `lib/services/search.ts` and define proper hit interfaces.

## 3. Performance & AI

- [x] **Model Optimization**: Switch from `gpt-4` to `gpt-4o-mini` in `app/api/chat/route.ts` for faster and cheaper responses.

## 4. Verification

- [x] **Test Suite**: Run `npm run test` to verify that helper functions still behave correctly.
- [x] **Build Check**: Run `next build` (or `tsc`) to ensure no type errors were introduced by the renames.
