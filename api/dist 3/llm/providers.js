"use strict";
/**
 * LLM providers: Ollama (local), OpenAI, Anthropic.
 * Single complete(system, user) with retry and timeout.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.complete = complete;
const config_1 = require("./config");
const { requestTimeoutMs, maxRetries, retryDelayMs } = config_1.llmConfig;
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
/** Ollama: POST ${url}/api/generate { model, prompt, stream: false } */
async function completeOllama(system, user) {
    const prompt = system ? `${system}\n\n${user}` : user;
    const url = `${config_1.llmConfig.ollamaUrl.replace(/\/$/, "")}/api/generate`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: config_1.llmConfig.ollamaModel,
            prompt,
            stream: false,
        }),
        signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama generate failed ${res.status}: ${text}`);
    }
    const data = (await res.json());
    const text = data.response?.trim();
    if (text == null)
        throw new Error("Ollama response missing .response");
    return text;
}
/** OpenAI: POST /v1/chat/completions */
async function completeOpenAI(system, user) {
    const key = config_1.llmConfig.openaiApiKey;
    if (!key)
        throw new Error("OPENAI_API_KEY required when LLM_PROVIDER=openai");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
            model: config_1.llmConfig.openaiModel,
            messages: [
                ...(system ? [{ role: "system", content: system }] : []),
                { role: "user", content: user },
            ],
            max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI chat failed ${res.status}: ${text}`);
    }
    const data = (await res.json());
    const content = data.choices?.[0]?.message?.content?.trim();
    if (content == null)
        throw new Error("OpenAI response missing .choices[0].message.content");
    return content;
}
/** Anthropic: POST /v1/messages */
async function completeAnthropic(system, user) {
    const key = config_1.llmConfig.anthropicApiKey;
    if (!key)
        throw new Error("ANTHROPIC_API_KEY required when LLM_PROVIDER=anthropic");
    const body = {
        model: config_1.llmConfig.anthropicModel,
        max_tokens: 1024,
        messages: [{ role: "user", content: user }],
    };
    if (system)
        body.system = system;
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
    const data = (await res.json());
    const block = data.content?.find((c) => c.type === "text");
    const text = block && "text" in block ? block.text?.trim() : null;
    if (text == null)
        throw new Error("Anthropic response missing .content[].text");
    return text;
}
async function complete(provider, system, user) {
    const fn = provider === "ollama"
        ? () => completeOllama(system, user)
        : provider === "openai"
            ? () => completeOpenAI(system, user)
            : () => completeAnthropic(system, user);
    return withRetry(fn);
}
