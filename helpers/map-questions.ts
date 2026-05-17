import { type Question, type QuizResponse } from "@/lib/schemas/quiz";

export const mapQuestionsFromResponse = (
  responseQuestions: Array<Partial<QuizResponse["questions"][number]> | undefined>
) => {
  return responseQuestions
    .map((question, index) => {
      if (!question?.question || !question?.answer) return undefined;

      return {
        id: question.question + index.toString(),
        questionText: question.question,
        options: [
          question.option1,
          question.option2,
          question.option3,
          question.answer,
        ]
          .sort(() => Math.random() - 0.5)
          .map((text) => ({ id: text! + question.question, text })),
        answerId: question.answer + question.question,
      };
    })
    .filter(
      (q): q is Question =>
        q !== undefined &&
        typeof q.questionText === "string" &&
        q.options?.every((opt) => typeof opt.text === "string")
    );
};
