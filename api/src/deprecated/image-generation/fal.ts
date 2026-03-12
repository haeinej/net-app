/**
 * fal.ai Flux calls (Phase 4).
 * Uses fal-ai/flux/dev with direct reference-photo conditioning and falls back to text-only
 * only for non-fatal reference-photo failures.
 */

import { fal } from "@fal-ai/client";
import {
  imageConfig,
  CINEMATIC_SUFFIX,
  NEGATIVE_PROMPT,
} from "./config";

type AnyInput = Record<string, any>;

export type FalImageResult = {
  url: string;
  requestId?: string;
  seed?: number;
  usedIpAdapter: boolean;
};

function describeFalError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const maybeError = error as {
    message?: string;
    body?: { detail?: string };
  };
  return maybeError.body?.detail || maybeError.message || String(error);
}

function isFatalFalError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { status?: number; body?: { detail?: string } };
  const detail = maybeError.body?.detail?.toLowerCase() ?? "";
  return maybeError.status === 401 || maybeError.status === 403 || detail.includes("exhausted balance");
}

function buildPrompt(sentence: string, context?: string | null): string {
  const trimmedSentence = sentence.trim();
  const trimmedContext = context?.trim();

  return [
    "Create a polished, expressive image inspired by the text.",
    "When a reference photo is provided, preserve the person's recognizable identity while adapting the pose, outfit, framing, and environment to the idea.",
    `Thought: ${trimmedSentence}.`,
    trimmedContext ? `Context: ${trimmedContext}.` : null,
    CINEMATIC_SUFFIX,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Call fal-ai/flux-general with optional IP-Adapter. On IP-Adapter failure, retry without.
 */
export async function generateWithFlux(
  sentence: string,
  profilePhotoUrl: string | null,
  context?: string | null
): Promise<FalImageResult> {
  const key = imageConfig.falKey;
  if (!key) throw new Error("FAL_KEY is required for image generation");
  fal.config({ credentials: key });

  const prompt = buildPrompt(sentence, context);
  const baseInput = {
    prompt,
    negative_prompt: NEGATIVE_PROMPT,
    image_size: { width: imageConfig.imageWidth, height: imageConfig.imageHeight },
    num_inference_steps: imageConfig.numInferenceSteps,
    guidance_scale: imageConfig.guidanceScale,
    num_images: 1,
  };

  if (profilePhotoUrl) {
    try {
      const result = await fal.subscribe(imageConfig.fluxEndpoint as any, {
        input: {
          ...baseInput,
          ip_adapter_image_url: profilePhotoUrl,
          ip_adapter_scale: imageConfig.ipAdapterScale,
        } as AnyInput,
        logs: false,
      });
      const data = result.data as { images?: Array<{ url?: string }>; seed?: number };
      const url = data.images?.[0]?.url;
      if (!url) throw new Error("fal response missing images[0].url");
      return {
        url,
        requestId: (result as { requestId?: string }).requestId,
        seed: data.seed,
        usedIpAdapter: true,
      };
    } catch (e) {
      if (isFatalFalError(e)) {
        throw new Error(describeFalError(e));
      }
      // Fallback: text-only Flux (no profile photo influence)
    }
  }

  let result;
  try {
    result = await fal.subscribe(imageConfig.fluxEndpoint as any, {
      input: baseInput as AnyInput,
      logs: false,
    });
  } catch (error) {
    throw new Error(describeFalError(error));
  }
  const data = result.data as { images?: Array<{ url?: string }>; seed?: number };
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("fal response missing images[0].url");
  return {
    url,
    requestId: (result as { requestId?: string }).requestId,
    seed: data.seed,
    usedIpAdapter: false,
  };
}

/**
 * Image-to-image pass (for crossing: second photo influence).
 */
export async function fluxImageToImage(
  imageUrl: string,
  sentence: string,
  profilePhotoUrl: string
): Promise<FalImageResult> {
  const key = imageConfig.falKey;
  if (!key) throw new Error("FAL_KEY is required");
  fal.config({ credentials: key });

  const prompt = buildPrompt(sentence);
  const input: Record<string, unknown> = {
    prompt,
    negative_prompt: NEGATIVE_PROMPT,
    image_url: imageUrl,
    strength: 0.4,
    image_size: { width: imageConfig.imageWidth, height: imageConfig.imageHeight },
    num_inference_steps: imageConfig.numInferenceSteps,
    guidance_scale: imageConfig.guidanceScale,
  };
  if (imageConfig.ipAdapterPath && imageConfig.ipAdapterImageEncoderPath) {
    input.ip_adapters = [
      {
        path: imageConfig.ipAdapterPath,
        image_encoder_path: imageConfig.ipAdapterImageEncoderPath,
        image_url: profilePhotoUrl,
        scale: 0.25,
      },
    ];
  }

  const result = await fal.subscribe(imageConfig.fluxImageToImageEndpoint as any, {
    input: input as AnyInput,
    logs: false,
  });
  const data = result.data as { images?: Array<{ url?: string }>; seed?: number };
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("fal image-to-image response missing images[0].url");
  return {
    url,
    requestId: (result as { requestId?: string }).requestId,
    seed: data.seed,
    usedIpAdapter: true,
  };
}
