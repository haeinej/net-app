/**
 * Embedding service configuration — uses Ollama running locally on Mac.
 * Model: nomic-embed-text (768-dim vectors)
 */

export type EmbeddingProvider = "ollama";

export const embeddingConfig = {
  provider: "ollama" as EmbeddingProvider,
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  model: process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
  /** Prefix for documents being stored (nomic uses search_document/search_query) */
  documentPrefix: process.env.EMBEDDING_DOCUMENT_PREFIX ?? "search_document: ",
  /** Prefix for queries when searching */
  queryPrefix: process.env.EMBEDDING_QUERY_PREFIX ?? "search_query: ",
  requestTimeoutMs: 15_000,
  retryDelayMs: 500,
  maxRetries: 1,
  maxBatchSize: 32,
  cacheMaxSize: 1000,
} as const;

export const EMBEDDING_DIM = 768;
