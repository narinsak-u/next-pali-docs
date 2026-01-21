import { embed, streamObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { openai } from '@ai-sdk/openai';
import { index } from "@/lib/pinecone";
import { quizResponeseSchema } from "@/lib/schemas/quiz";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function quizAction(input: { topics: string[]; amount: number }) {

  // 1️⃣ Embed the question
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: input.topics.join(', '),
    providerOptions: {
      openai: {
        dimensions: 1536, // optional, number of dimensions for the embedding
        // user: 'test-user', // optional unique user identifier
      },
    },
  });

  // console.log(embedding, "embedding");

  // 2️⃣ Retrieve from Pinecone
  const results = await index.namespace("__default__").query({
    vector: embedding,
    topK: 10,
    includeMetadata: true,
  });

  // console.log(results, "pinecone results");

  const context = results.matches
    .map(match => match.metadata?.text)
    .filter(Boolean)
    .join('\n---\n');

  console.log(context, "context");

  try {
    // if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    //   return {
    //     error: "Google API key is not configured",
    //   };
    // }

    // setup google generative ai
    // const google = createGoogleGenerativeAI({
    //   apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    // });

    // Using this book content as reference: ${JSON.stringify(bookContent)}

    const result = streamObject({
      // model: google("gemini-2.0-flash-exp"),
      model: openai("gpt-4o-mini"),
      schema: quizResponeseSchema,
      prompt: `
      Using this context as reference: ${context}
      Generate ${input.amount} multiple-choice questions about ${input.topics}.
      The questions must be based on the provided context.
      Each question should test understanding of key concepts from the context.

      Make sure each question and its options are directly related to the content provided.
      Ensure all fields are within the word limits.
      Translate all questions, answers, and options to Thai language.
      `,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Error processing chat request:", error);
    return {
      error: "Failed to process request!",
    };
  }
}
