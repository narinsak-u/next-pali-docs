import { ProvideLinksToolSchema } from "@/lib/chat/inkeep-qa-schema";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText } from "ai";
import { searchService } from "@/lib/services/search";

export const runtime = "edge";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const reqJson = await req.json();
  const userLatestMessage = reqJson.messages[reqJson.messages.length - 1];

  let contextContent = "";
  try {
    const results = await searchService.search({
      query: userLatestMessage.content,
      hitsPerPage: 5,
    });
    contextContent = searchService.formatAsContext(results);
  } catch (error) {
    console.error("Algolia search error:", error);
  }

  const messagesWithContext = [
    {
      role: "system",
      content: `You are a helpful assistant for the Pali documentation. Use the following context to answer questions. If the context doesn't contain relevant information, say so.\n\nContext:\n${contextContent}`,
    },
    ...reqJson.messages,
  ];

  const result = streamText({
    model: openai("gpt-4"),
    tools: {
      provideLinks: {
        inputSchema: ProvideLinksToolSchema,
      },
    },
    messages: convertToModelMessages(messagesWithContext, {
      ignoreIncompleteToolCalls: true,
    }),
    toolChoice: "auto",
  });

  return result.toUIMessageStreamResponse();
}