import { index } from '@/lib/pinecone';
import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, embed, streamText, UIMessage } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
    const { messages }: { messages: UIMessage[] } = await req.json();

    // 1️⃣ Embed the question
    const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: messages[messages.length - 1].parts.find(p => p.type === 'text')?.text || '',
        providerOptions: {
            openai: {
                dimensions: 1536,
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

    // console.log(context, "context");

    const result = streamText({
        model: openai("gpt-4o-mini"),
        system: `You are a helpful assistant that answers questions about the Pali language. Use the context provided to answer the question. If the context does not provide the answer, say "I don't know".
        
        Context:
        ${context}`,
        messages: convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
}