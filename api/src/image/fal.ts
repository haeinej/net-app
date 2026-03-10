/**
 * fal.ai Flux + IP-Adapter calls (Phase 4).
 * Uses fal-ai/flux-general (text-to-image) with optional ip_adapters; fallback to text-only.
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

function buildPrompt(sentence: string): string {
  return `${sentence}. ${CINEMATIC_SUFFIX}`.trim();
}

/**
 * Call fal-ai/flux-general with optional IP-Adapter. On IP-Adapter failure, retry without.
 */
export async function generateWithFlux(
  sentence: string,
  profilePhotoUrl: string | null
): Promise<FalImageResult> {
  const key = imageConfig.falKey;
  if (!key) throw new Error("FAL_KEY is required for image generation");
  fal.config({ credentials: key });

  const prompt = buildPrompt(sentence);
  const baseInput = {
    prompt,
    negative_prompt: NEGATIVE_PROMPT,
    image_size: { width: imageConfig.imageWidth, height: imageConfig.imageHeight },
    num_inference_steps: imageConfig.numInferenceSteps,
    guidance_scale: imageConfig.guidanceScale,
    num_images: 1,
  };

  const withIpAdapter =
    profilePhotoUrl &&
    imageConfig.ipAdapterPath &&
    imageConfig.ipAdapterImageEncoderPath;

  if (withIpAdapter) {
    try {
      const result = await fal.subscribe(imageConfig.fluxEndpoint as any, {
        input: {
          ...baseInput,
          ip_adapters: [
            {
              path: imageConfig.ipAdapterPath!,
              image_encoder_path: imageConfig.ipAdapterImageEncoderPath,
              image_url: profilePhotoUrl,
              scale: imageConfig.ipAdapterScale,
            },
          ],
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
      // Fallback: text-only Flux (no profile photo influence)
    }
  }

  const result = await fal.subscribe(imageConfig.fluxEndpoint as any, {
    input: baseInput as AnyInput,
    logs: false,
  });
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
