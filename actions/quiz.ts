import { generateEmbedding } from "@/lib/services/embedding";
import { queryPinecone, formatContext } from "@/lib/services/vector-store";
import { generateQuizResponse } from "@/lib/services/quiz-generator";

export const maxDuration = 30;

export async function quizAction(input: { topics: string[]; amount: number }) {
  try {
    const embedding = await generateEmbedding(input.topics.join(", "));

    const matches = await queryPinecone(embedding, 10);
    const context = formatContext(matches);

    console.log(context, "context");

    const response = await generateQuizResponse({
      topics: input.topics,
      amount: input.amount,
      context,
    });

    return response;
  } catch (error) {
    console.error("Error processing quiz request:", error);
    return {
      error: "Failed to process request!",
    };
  }
}