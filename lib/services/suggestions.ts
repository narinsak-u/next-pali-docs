import { generateText, Output } from "ai";
import { z } from "zod";
import { openrouter } from "@/lib/services/openrouter-client";

const suggestionsSchema = z.object({
  suggestions: z.array(z.string().min(1)).length(3),
});

export async function generateSuggestions(
  answer: string,
): Promise<string[]> {
  const { experimental_output } = await generateText({
    model: openrouter(process.env.LLM_MODEL ?? "google/gemma-4-31b-it:free"),
    system:
      "You generate exactly 3 follow-up questions in the same language as the user's last message. Keep them short, focused, and grounded in the previous answer.",
    prompt: `Previous answer:\n${answer}\n\nGenerate 3 follow-up questions.`,
    experimental_output: Output.object({ schema: suggestionsSchema }),
  });
  return experimental_output.suggestions;
}
