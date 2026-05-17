import { generateEmbedding } from "./embedding";
import {
  queryPinecone,
  formatContext,
  type DocumentMatch,
} from "./vector-store";
import {
  generateQuizResponse,
  type QuizGenerationInput,
} from "./quiz-generator";

export interface QuizInput {
  topics: string[];
  amount: number;
}

export interface EmbeddingPort {
  generateEmbedding(text: string): Promise<number[]>;
}

export interface VectorStorePort {
  queryPinecone(embedding: number[], topK: number): Promise<DocumentMatch[]>;
}

export interface QuizGeneratorPort {
  generateQuizResponse(input: QuizGenerationInput): Promise<Response>;
}

const defaultEmbedding: EmbeddingPort = {
  generateEmbedding,
};

const defaultVectorStore: VectorStorePort = {
  async queryPinecone(embedding, topK) {
    return queryPinecone(embedding, topK);
  },
};

const defaultQuizGenerator: QuizGeneratorPort = {
  generateQuizResponse,
};

export interface QuizPipelineDeps {
  embedding?: EmbeddingPort;
  vectorStore?: VectorStorePort;
  quizGenerator?: QuizGeneratorPort;
}

export async function generateQuiz(
  input: QuizInput,
  deps: QuizPipelineDeps = {},
): Promise<Response> {
  const embedding = deps.embedding ?? defaultEmbedding;
  const vectorStore = deps.vectorStore ?? defaultVectorStore;
  const quizGenerator = deps.quizGenerator ?? defaultQuizGenerator;

  const embeddingResult = await embedding.generateEmbedding(
    input.topics.join(", "),
  );
  const matches = await vectorStore.queryPinecone(embeddingResult, 10);
  const context = formatContext(matches);

  return quizGenerator.generateQuizResponse({
    topics: input.topics,
    amount: input.amount,
    context,
  });
}
