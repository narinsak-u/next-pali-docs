import { quizAction } from "@/actions/quiz";
import { quizSchema } from "@/lib/schemas/quiz";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const data = await req.json();

    // convert data to zod schema
    const parsedData = quizSchema.parse(data);
    // console.log(parsedData, "parsedData");

    // Call the quiz action
    const result = await quizAction({
      topics: parsedData.topics,
      amount: parsedData.amount,
    });

    console.log(result, "result");

    // If there's an error, return it
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // console.log(result, "result");

    // Forward the streaming response
    return result;
  } catch (error) {
    console.error("Error processing quiz request:", error);

    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
