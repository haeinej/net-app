/**
 * Embedding providers: local TEI and Hugging Face Inference API.
 * Shared timeout (10s) and retry (1 retry, 500ms delay).
 */

import {
  embeddingConfig,
  type EmbeddingProvider,
} from "./config";

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


/** Local TEI: POST ${url}/embed { inputs: string[] } -> float[][] */
async function fetchLocal(inputs: string[]): Promise<number[][]> {
  const url = `${embeddingConfig.serverUrl.replace(/\/$/, "")}/embed`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs }),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TEI embed failed ${res.status}: ${body}`);
  }
  const data = (await res.json()) as number[][];
  if (!Array.isArray(data) || (data.length > 0 && !Array.isArray(data[0]))) {
    throw new Error("TEI embed: unexpected response shape");
  }
  return data;
}

/** Hugging Face Inference API: feature-extraction pipeline */
async function fetchHuggingFace(inputs: string[]): Promise<number[][]> {
  const token = embeddingConfig.hfToken;
  if (!token) {
    throw new Error("HF_API_TOKEN (or HF_TOKEN) is required when EMBEDDING_PROVIDER=huggingface");
  }
  const url = `https://api-inference.huggingface.co/pipeline/feature-extraction/${embeddingConfig.modelId}`;
  const body = inputs.length === 1 ? { inputs: inputs[0] } : { inputs };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HuggingFace embed failed ${res.status}: ${text}`);
  }
  const data = (await res.json()) as number[] | number[][];
  // HF returns single vector for single input, array of vectors for multiple
  if (inputs.length === 1) {
    if (!Array.isArray(data) || typeof (data as number[])[0] !== "number") {
      throw new Error("HuggingFace embed: unexpected single-response shape");
    }
    return [data as number[]];
  }
  if (!Array.isArray(data) || !Array.isArray((data as number[][])[0])) {
    throw new Error("HuggingFace embed: unexpected batch response shape");
  }
  return data as number[][];
}

export async function embedRemote(
  provider: EmbeddingProvider,
  inputs: string[]
): Promise<number[][]> {
  const fn =
    provider === "local"
      ? () => fetchLocal(inputs)
      : () => fetchHuggingFace(inputs);
  return withRetry(fn);
}
