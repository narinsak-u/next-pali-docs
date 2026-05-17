import { quizAction } from "@/actions/quiz";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const data = await req.json();
  const result = await quizAction(data);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return result;
}
