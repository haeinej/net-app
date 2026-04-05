"use strict";
/**
 * EmbeddingService — 768-dim embeddings via Ollama (nomic-embed-text).
 * LRU cache; retry and timeout.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingService = void 0;
exports.cosineSimilarity = cosineSimilarity;
exports.getEmbeddingService = getEmbeddingService;
const config_1 = require("./config");
const cache_1 = require("./cache");
const providers_1 = require("./providers");
function prefixText(text, task) {
    const prefix = task === "document"
        ? config_1.embeddingConfig.documentPrefix
        : config_1.embeddingConfig.queryPrefix;
    return prefix + text;
}
/**
 * Cosine similarity between two vectors (application-level; use pgvector <=> in DB).
 */
function cosineSimilarity(a, b) {
    if (a.length !== b.length) {
        throw new Error("Vectors must have the same length");
    }
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0)
        return 0;
    return dot / denom;
}
class EmbeddingService {
    cache = new cache_1.LRUCache(config_1.embeddingConfig.cacheMaxSize);
    /**
     * Embed a single text. Uses "search_document: " for documents, "search_query: " for queries.
     * Returns 768-dimensional vector.
     */
    async embed(text, task = "document") {
        const prefixed = prefixText(text, task);
        const key = (0, cache_1.cacheKey)(prefixed, "");
        const cached = this.cache.get(key);
        if (cached)
            return cached;
        const results = await (0, providers_1.embedRemote)(config_1.embeddingConfig.provider, [prefixed]);
        const vector = results[0];
        if (!vector || vector.length !== config_1.EMBEDDING_DIM) {
            throw new Error(`Embedding dimension mismatch: expected ${config_1.EMBEDDING_DIM}, got ${vector?.length ?? 0}`);
        }
        this.cache.set(key, vector);
        return vector;
    }
    /**
     * Batch embed (max 32 per request; larger batches are split automatically).
     */
    async embedBatch(texts, task = "document") {
        if (texts.length === 0)
            return [];
        const prefixed = texts.map((t) => prefixText(t, task));
        const maxBatch = config_1.embeddingConfig.maxBatchSize;
        const results = [];
        const toFetch = [];
        const resultSlots = new Array(texts.length).fill(null);
        for (let i = 0; i < prefixed.length; i++) {
            const key = (0, cache_1.cacheKey)(prefixed[i], "");
            const cached = this.cache.get(key);
            if (cached) {
                resultSlots[i] = cached;
            }
            else {
                toFetch.push({ index: i, text: prefixed[i] });
            }
        }
        for (let start = 0; start < toFetch.length; start += maxBatch) {
            const chunk = toFetch.slice(start, start + maxBatch);
            const inputs = chunk.map((x) => x.text);
            const vectors = await (0, providers_1.embedRemote)(config_1.embeddingConfig.provider, inputs);
            for (let j = 0; j < chunk.length; j++) {
                const vec = vectors[j];
                if (!vec || vec.length !== config_1.EMBEDDING_DIM) {
                    throw new Error(`Embedding dimension mismatch: expected ${config_1.EMBEDDING_DIM}, got ${vec?.length ?? 0}`);
                }
                const idx = chunk[j].index;
                resultSlots[idx] = vec;
                this.cache.set((0, cache_1.cacheKey)(inputs[j], ""), vec);
            }
        }
        for (const slot of resultSlots) {
            results.push(slot);
        }
        return results;
    }
}
exports.EmbeddingService = EmbeddingService;
let defaultInstance = null;
/**
 * Singleton EmbeddingService instance (lazy).
 */
function getEmbeddingService() {
    if (!defaultInstance) {
        defaultInstance = new EmbeddingService();
    }
    return defaultInstance;
}
