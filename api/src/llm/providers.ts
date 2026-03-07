/**
 * LLM providers: Ollama (local), OpenAI, Anthropic.
 * Single complete(system, user) with retry and timeout.
 */

import { llmConfig, type LLMProvider } from "./config";

const { requestTimeoutMs, maxRetries, retryDelayMs } = llmConfig;

async function withRetry<T>(fn: () => Promise<T>, retriesLeft = maxRetries): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retriesLeft <= 0) throw err;
    await new Promise((r) => setTimeout(r, retryDelayMs));
    return withRetry(fn, retriesLeft - 1);
  }
}

/** Ollama: POST ${url}/api/generate { model, prompt, stream: false } */
async function completeOllama(system: string, user: string): Promise<string> {
  const prompt = system ? `${system}\n\n${user}` : user;
  const url = `${llmConfig.ollamaUrl.replace(/\/$/, "")}/api/generate`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: llmConfig.ollamaModel,
      prompt,
      stream: false,
    }),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama generate failed ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { response?: string };
  const text = data.response?.trim();
  if (text == null) throw new Error("Ollama response missing .response");
  return text;
}

/** OpenAI: POST /v1/chat/completions */
async function completeOpenAI(system: string, user: string): Promise<string> {
  const key = llmConfig.openaiApiKey;
  if (!key) throw new Error("OPENAI_API_KEY required when LLM_PROVIDER=openai");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: llmConfig.openaiModel,
      messages: [
        ...(system ? [{ role: "system" as const, content: system }] : []),
        { role: "user" as const, content: user },
      ],
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI chat failed ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (content == null) throw new Error("OpenAI response missing .choices[0].message.content");
  return content;
}

/** Anthropic: POST /v1/messages */
async function completeAnthropic(system: string, user: string): Promise<string> {
  const key = llmConfig.anthropicApiKey;
  if (!key) throw new Error("ANTHROPIC_API_KEY required when LLM_PROVIDER=anthropic");
  const body: Record<string, unknown> = {
    model: llmConfig.anthropicModel,
    max_tokens: 1024,
    messages: [{ role: "user" as const, content: user }],
  };
  if (system) body.system = system;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic messages failed ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const block = data.content?.find((c) => c.type === "text");
  const text = block && "text" in block ? (block as { text: string }).text?.trim() : null;
  if (text == null) throw new Error("Anthropic response missing .content[].text");
  return text;
}

export async function complete(
  provider: LLMProvider,
  system: string,
  user: string
): Promise<string> {
  const fn =
    provider === "ollama"
      ? () => completeOllama(system, user)
      : provider === "openai"
        ? () => completeOpenAI(system, user)
        : () => completeAnthropic(system, user);
  return withRetry(fn);
}
