import { generateQuiz, isQuotaError } from "@/lib/services/quiz-pipeline";
import { quizSchema } from "@/lib/schemas/quiz";

export const maxDuration = 30;

export async function quizAction(input: unknown) {
  try {
    const parsed = quizSchema.parse(input);
    return await generateQuiz({ topics: parsed.topics, amount: parsed.amount });
  } catch (error: unknown) {
    console.error("Error processing quiz request:", error);
    if (isQuotaError(error)) {
      throw new Error("insufficient_quota");
    }
    return {
      error: "Failed to process request!",
    };
  }
}
