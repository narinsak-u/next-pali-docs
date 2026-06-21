import type { Index, Pinecone as PineconeClient } from "@pinecone-database/pinecone";

const apiKey = process.env.PINECONE_API_KEY || "";
const indexName = process.env.PINECONE_INDEX_NAME || "";

let _client: PineconeClient | null = null;
let _index: Index | null = null;

async function loadPinecone(): Promise<PineconeClient> {
  if (!_client) {
    const { Pinecone } = await import(
      /* webpackIgnore: true */ "@pinecone-database/pinecone"
    );
    _client = new Pinecone({ apiKey });
  }
  return _client;
}

export async function getPinecone(): Promise<PineconeClient> {
  return loadPinecone();
}

export async function getIndex(): Promise<Index> {
  if (!_index) {
    const client = await loadPinecone();
    _index = client.index(indexName);
  }
  return _index;
}

export const environment = process.env.PINECONE_ENVIRONMENT || "";
