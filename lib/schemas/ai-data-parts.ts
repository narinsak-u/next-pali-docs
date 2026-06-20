import { z } from "zod";

export const taskStatusSchema = z.enum(["pending", "running", "done", "error"]);

export const reasoningPartSchema = z.object({
  summary: z.string().min(1),
});

export const taskPartSchema = z.object({
  label: z.string().min(1),
  status: taskStatusSchema,
  query: z.string().optional(),
  matchCount: z.number().int().nonnegative().optional(),
  message: z.string().optional(),
});

export const suggestionsPartSchema = z.object({
  suggestions: z.array(z.string().min(1)).length(3),
});

export type ReasoningPart = z.infer<typeof reasoningPartSchema>;
export type TaskPart = z.infer<typeof taskPartSchema>;
export type SuggestionsPart = z.infer<typeof suggestionsPartSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
