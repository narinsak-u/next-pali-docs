import { generateQuiz } from "@/lib/services/quiz-pipeline";
import { quizSchema } from "@/lib/schemas/quiz";

export const maxDuration = 30;

export async function quizAction(input: unknown) {
  try {
    const parsed = quizSchema.parse(input);
    return generateQuiz({ topics: parsed.topics, amount: parsed.amount });
  } catch (error) {
    console.error("Error processing quiz request:", error);
    return {
      error: "Failed to process request!",
    };
  }
}
