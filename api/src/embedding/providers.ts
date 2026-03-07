/**
 * Embedding provider: Ollama running locally on Mac.
 * POST /api/embeddings { model, prompt } -> { embedding: float[] }
 */

import { embeddingConfig } from "./config";

const { requestTimeoutMs, retryDelayMs, maxRetries } = embeddingConfig;

async function withRetry<T>(
  fn: () => Promise<T>,
  retriesLeft = maxRetries
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retriesLeft <= 0) throw err;
    await new Promise((r) => setTimeout(r, retryDelayMs));
    return withRetry(fn, retriesLeft - 1);
  }
}

/** Ollama embeddings: one request per input (Ollama doesn't batch) */
async function fetchOllama(inputs: string[]): Promise<number[][]> {
  const url = `${embeddingConfig.ollamaUrl.replace(/\/$/, "")}/api/embeddings`;
  const results: number[][] = [];

  for (const input of inputs) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: embeddingConfig.model, prompt: input }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama embed failed ${res.status}: ${body}`);
    }
    const data = (await res.json()) as { embedding: number[] };
    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error("Ollama embed: unexpected response shape");
    }
    results.push(data.embedding);
  }

  return results;
}

export async function embedRemote(
  _provider: string,
  inputs: string[]
): Promise<number[][]> {
  return withRetry(() => fetchOllama(inputs));
}
