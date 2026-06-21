import { createUIMessageStreamResponse } from "ai";
import { generateQuizStream, isQuotaError } from "@/lib/services/quiz-pipeline";
import { quizSchema } from "@/lib/schemas/quiz";
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const parsed = quizSchema.parse(data);

    const stream = generateQuizStream({
      topics: parsed.topics,
      amount: parsed.amount,
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error: unknown) {
    console.error("Quiz API error:", error);
    if (isQuotaError(error)) {
      return NextResponse.json(
        { error: "บริการ AI หมดโควต้าการใช้งาน กรุณาลองใหม่อีกครั้งในภายหลัง" },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการสร้างแบบทดสอบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
