"use strict";
/**
 * Embedding provider: Ollama running locally on Mac.
 * POST /api/embeddings { model, prompt } -> { embedding: float[] }
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedRemote = embedRemote;
const config_1 = require("./config");
const { requestTimeoutMs, retryDelayMs, maxRetries } = config_1.embeddingConfig;
async function withRetry(fn, retriesLeft = maxRetries) {
    try {
        return await fn();
    }
    catch (err) {
        if (retriesLeft <= 0)
            throw err;
        await new Promise((r) => setTimeout(r, retryDelayMs));
        return withRetry(fn, retriesLeft - 1);
    }
}
/** Ollama embeddings: one request per input (Ollama doesn't batch) */
async function fetchOllama(inputs) {
    const url = `${config_1.embeddingConfig.ollamaUrl.replace(/\/$/, "")}/api/embeddings`;
    const results = [];
    for (const input of inputs) {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: config_1.embeddingConfig.model, prompt: input }),
            signal: AbortSignal.timeout(requestTimeoutMs),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Ollama embed failed ${res.status}: ${body}`);
        }
        const data = (await res.json());
        if (!data.embedding || !Array.isArray(data.embedding)) {
            throw new Error("Ollama embed: unexpected response shape");
        }
        results.push(data.embedding);
    }
    return results;
}
async function embedRemote(_provider, inputs) {
    return withRetry(() => fetchOllama(inputs));
}
