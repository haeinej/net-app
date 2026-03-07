/**
 * EmbeddingService — 768-dim embeddings via Ollama (nomic-embed-text).
 * LRU cache; retry and timeout.
 */

import { embeddingConfig, EMBEDDING_DIM } from "./config";
import { cacheKey, LRUCache } from "./cache";
import { embedRemote } from "./providers";

export type EmbedTask = "document" | "query";

function prefixText(text: string, task: EmbedTask): string {
  const prefix =
    task === "document"
      ? embeddingConfig.documentPrefix
      : embeddingConfig.queryPrefix;
  return prefix + text;
}

/**
 * Cosine similarity between two vectors (application-level; use pgvector <=> in DB).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export class EmbeddingService {
  private cache = new LRUCache<number[]>(embeddingConfig.cacheMaxSize);

  /**
   * Embed a single text. Uses "search_document: " for documents, "search_query: " for queries.
   * Returns 768-dimensional vector.
   */
  async embed(text: string, task: EmbedTask = "document"): Promise<number[]> {
    const prefixed = prefixText(text, task);
    const key = cacheKey(prefixed, "");
    const cached = this.cache.get(key);
    if (cached) return cached;

    const results = await embedRemote(embeddingConfig.provider, [prefixed]);
    const vector = results[0];
    if (!vector || vector.length !== EMBEDDING_DIM) {
      throw new Error(
        `Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${vector?.length ?? 0}`
      );
    }
    this.cache.set(key, vector);
    return vector;
  }

  /**
   * Batch embed (max 32 per request; larger batches are split automatically).
   */
  async embedBatch(
    texts: string[],
    task: EmbedTask = "document"
  ): Promise<number[][]> {
    if (texts.length === 0) return [];

    const prefixed = texts.map((t) => prefixText(t, task));
    const maxBatch = embeddingConfig.maxBatchSize;
    const results: number[][] = [];
    const toFetch: { index: number; text: string }[] = [];
    const resultSlots: (number[] | null)[] = new Array(texts.length).fill(null);

    for (let i = 0; i < prefixed.length; i++) {
      const key = cacheKey(prefixed[i]!, "");
      const cached = this.cache.get(key);
      if (cached) {
        resultSlots[i] = cached;
      } else {
        toFetch.push({ index: i, text: prefixed[i]! });
      }
    }

    for (let start = 0; start < toFetch.length; start += maxBatch) {
      const chunk = toFetch.slice(start, start + maxBatch);
      const inputs = chunk.map((x) => x.text);
      const vectors = await embedRemote(embeddingConfig.provider, inputs);
      for (let j = 0; j < chunk.length; j++) {
        const vec = vectors[j];
        if (!vec || vec.length !== EMBEDDING_DIM) {
          throw new Error(
            `Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${vec?.length ?? 0}`
          );
        }
        const idx = chunk[j]!.index;
        resultSlots[idx] = vec;
        this.cache.set(cacheKey(inputs[j]!, ""), vec);
      }
    }

    for (const slot of resultSlots) {
      results.push(slot!);
    }
    return results;
  }
}

let defaultInstance: EmbeddingService | null = null;

/**
 * Singleton EmbeddingService instance (lazy).
 */
export function getEmbeddingService(): EmbeddingService {
  if (!defaultInstance) {
    defaultInstance = new EmbeddingService();
  }
  return defaultInstance;
}
