import { generateQuiz, isQuotaError } from "@/lib/services/quiz-pipeline";
import { quizSchema } from "@/lib/schemas/quiz";
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const parsed = quizSchema.parse(data);
    return await generateQuiz({ topics: parsed.topics, amount: parsed.amount });
  } catch (error: unknown) {
    console.error("Quiz API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (isQuotaError(error) || message.includes("429")) {
      return NextResponse.json(
        { error: "บริการ AI หมดโควต้าการใช้งาน กรุณาลองใหม่อีกครั้งในภายหลัง" },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการสร้างแบบทดสอบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
