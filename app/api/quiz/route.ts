import { generateQuizStream } from "@/lib/services/quiz-pipeline";
import { quizSchema } from "@/lib/schemas/quiz";
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const parsed = quizSchema.parse(data);
    const stream = await generateQuizStream({
      topics: parsed.topics,
      amount: parsed.amount,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    console.error("Quiz API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (isQuotaError(error) || message.includes("429")) {
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

function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes("quota") || err.message.includes("429");
}
