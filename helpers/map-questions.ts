import { type Question } from "@/lib/schemas/quiz";

export const mapQuestionsFromResponse = (responseQuestions: any[]) => {
  return responseQuestions
    .map((question, index) => ({
      id: question?.question + index.toString(),
      questionText: question?.question,
      options: [
        question?.option1,
        question?.option2,
        question?.option3,
        question?.answer,
      ].map((text) => ({ id: text! + question?.question, text })),
      answerId: question?.answer! + question?.question!,
    }))
    .filter(
      (q): q is Question =>
        q !== undefined &&
        typeof q.questionText === "string" &&
        q.options?.every((opt) => typeof opt.text === "string")
    );
};
