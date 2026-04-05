"use strict";
/**
 * fal.ai Flux calls (Phase 4).
 * Uses fal-ai/flux/dev with direct reference-photo conditioning and falls back to text-only
 * only for non-fatal reference-photo failures.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateWithFlux = generateWithFlux;
exports.fluxImageToImage = fluxImageToImage;
const client_1 = require("@fal-ai/client");
const config_1 = require("./config");
function describeFalError(error) {
    if (!error || typeof error !== "object")
        return String(error);
    const maybeError = error;
    return maybeError.body?.detail || maybeError.message || String(error);
}
function isFatalFalError(error) {
    if (!error || typeof error !== "object")
        return false;
    const maybeError = error;
    const detail = maybeError.body?.detail?.toLowerCase() ?? "";
    return maybeError.status === 401 || maybeError.status === 403 || detail.includes("exhausted balance");
}
function buildPrompt(sentence, context) {
    const trimmedSentence = sentence.trim();
    const trimmedContext = context?.trim();
    return [
        "Create a polished, expressive image inspired by the text.",
        "When a reference photo is provided, preserve the person's recognizable identity while adapting the pose, outfit, framing, and environment to the idea.",
        `Thought: ${trimmedSentence}.`,
        trimmedContext ? `Context: ${trimmedContext}.` : null,
        config_1.CINEMATIC_SUFFIX,
    ]
        .filter(Boolean)
        .join(" ");
}
/**
 * Call fal-ai/flux-general with optional IP-Adapter. On IP-Adapter failure, retry without.
 */
async function generateWithFlux(sentence, profilePhotoUrl, context) {
    const key = config_1.imageConfig.falKey;
    if (!key)
        throw new Error("FAL_KEY is required for image generation");
    client_1.fal.config({ credentials: key });
    const prompt = buildPrompt(sentence, context);
    const baseInput = {
        prompt,
        negative_prompt: config_1.NEGATIVE_PROMPT,
        image_size: { width: config_1.imageConfig.imageWidth, height: config_1.imageConfig.imageHeight },
        num_inference_steps: config_1.imageConfig.numInferenceSteps,
        guidance_scale: config_1.imageConfig.guidanceScale,
        num_images: 1,
    };
    if (profilePhotoUrl) {
        try {
            const result = await client_1.fal.subscribe(config_1.imageConfig.fluxEndpoint, {
                input: {
                    ...baseInput,
                    ip_adapter_image_url: profilePhotoUrl,
                    ip_adapter_scale: config_1.imageConfig.ipAdapterScale,
                },
                logs: false,
            });
            const data = result.data;
            const url = data.images?.[0]?.url;
            if (!url)
                throw new Error("fal response missing images[0].url");
            return {
                url,
                requestId: result.requestId,
                seed: data.seed,
                usedIpAdapter: true,
            };
        }
        catch (e) {
            if (isFatalFalError(e)) {
                throw new Error(describeFalError(e));
            }
            // Fallback: text-only Flux (no profile photo influence)
        }
    }
    let result;
    try {
        result = await client_1.fal.subscribe(config_1.imageConfig.fluxEndpoint, {
            input: baseInput,
            logs: false,
        });
    }
    catch (error) {
        throw new Error(describeFalError(error));
    }
    const data = result.data;
    const url = data.images?.[0]?.url;
    if (!url)
        throw new Error("fal response missing images[0].url");
    return {
        url,
        requestId: result.requestId,
        seed: data.seed,
        usedIpAdapter: false,
    };
}
/**
 * Image-to-image pass (for crossing: second photo influence).
 */
async function fluxImageToImage(imageUrl, sentence, profilePhotoUrl) {
    const key = config_1.imageConfig.falKey;
    if (!key)
        throw new Error("FAL_KEY is required");
    client_1.fal.config({ credentials: key });
    const prompt = buildPrompt(sentence);
    const input = {
        prompt,
        negative_prompt: config_1.NEGATIVE_PROMPT,
        image_url: imageUrl,
        strength: 0.4,
        image_size: { width: config_1.imageConfig.imageWidth, height: config_1.imageConfig.imageHeight },
        num_inference_steps: config_1.imageConfig.numInferenceSteps,
        guidance_scale: config_1.imageConfig.guidanceScale,
    };
    if (config_1.imageConfig.ipAdapterPath && config_1.imageConfig.ipAdapterImageEncoderPath) {
        input.ip_adapters = [
            {
                path: config_1.imageConfig.ipAdapterPath,
                image_encoder_path: config_1.imageConfig.ipAdapterImageEncoderPath,
                image_url: profilePhotoUrl,
                scale: 0.25,
            },
        ];
    }
    const result = await client_1.fal.subscribe(config_1.imageConfig.fluxImageToImageEndpoint, {
        input: input,
        logs: false,
    });
    const data = result.data;
    const url = data.images?.[0]?.url;
    if (!url)
        throw new Error("fal image-to-image response missing images[0].url");
    return {
        url,
        requestId: result.requestId,
        seed: data.seed,
        usedIpAdapter: true,
    };
}
