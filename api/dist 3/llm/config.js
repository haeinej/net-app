"use strict";
/**
 * LLM config for question extraction and quality scoring (Phase 3).
 * Ollama (local) or OpenAI / Anthropic API fallback.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmConfig = void 0;
exports.llmConfig = {
    provider: (process.env.LLM_PROVIDER ?? "ollama"),
    ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "mistral",
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-20241022",
    requestTimeoutMs: 60_000,
    maxRetries: 1,
    retryDelayMs: 500,
};
