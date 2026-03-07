/**
 * Embedding service configuration (Phase 2).
 * Toggled by EMBEDDING_PROVIDER; model and prefixes are configurable for future bge-large etc.
 */

export type EmbeddingProvider = "local" | "huggingface";

export const embeddingConfig = {
  provider: (process.env.EMBEDDING_PROVIDER ?? "local") as EmbeddingProvider,
  serverUrl: process.env.EMBEDDING_SERVER_URL ?? "http://localhost:8080",
  hfToken: process.env.HF_API_TOKEN ?? process.env.HF_TOKEN,
  /** Model ID for Hugging Face Inference API (e.g. nomic-ai/nomic-embed-text-v1.5 or bge-large-en-v1.5) */
  modelId: process.env.EMBEDDING_MODEL_ID ?? "nomic-ai/nomic-embed-text-v1.5",
  /** Prefix for documents being stored (nomic uses search_document/search_query) */
  documentPrefix: process.env.EMBEDDING_DOCUMENT_PREFIX ?? "search_document: ",
  /** Prefix for queries when searching */
  queryPrefix: process.env.EMBEDDING_QUERY_PREFIX ?? "search_query: ",
  requestTimeoutMs: 10_000,
  retryDelayMs: 500,
  maxRetries: 1,
  maxBatchSize: 32,
  cacheMaxSize: 1000,
} as const;

export const EMBEDDING_DIM = 768;
