/**
 * Image generation config (Phase 4). fal.ai Flux + IP-Adapter.
 */

export const imageConfig = {
  falKey: process.env.FAL_KEY ?? process.env.FAL_CREDENTIALS,
  /** S3/R2 bucket for permanent storage; if unset, fal URL is returned as-is */
  storageBucket: process.env.IMAGE_STORAGE_BUCKET,
  /** CDN prefix for final image URLs (e.g. https://cdn.example.com/images) */
  cdnUrl: process.env.IMAGE_CDN_URL ?? "",
  /** Max images per user per calendar day */
  dailyCapPerUser: 20,
  /** fal-ai/flux-general (text-to-image with ip_adapters) */
  fluxEndpoint: "fal-ai/flux-general",
  /** fal-ai/flux-general/image-to-image for second-pass (crossing) */
  fluxImageToImageEndpoint: "fal-ai/flux-general/image-to-image",
  /** IP-Adapter scale: mood/palette influence, not literal face (0.3–0.4) */
  ipAdapterScale: 0.35,
  guidanceScale: 7.5,
  numInferenceSteps: 28,
  imageWidth: 1024,
  imageHeight: 768,
  /** HuggingFace path for IP-Adapter weights (optional; if unset, text-only fallback when IP fails) */
  ipAdapterPath: process.env.FAL_IP_ADAPTER_PATH,
  ipAdapterImageEncoderPath:
    process.env.FAL_IP_ADAPTER_IMAGE_ENCODER ?? "openai/clip-vit-large-patch14",
  requestTimeoutMs: 60_000,
} as const;

export const CINEMATIC_SUFFIX =
  "Cinematic landscape, desaturated, film grain, low contrast, atmospheric, wide angle, muted color palette, quiet mood, no text, no people, no faces";

export const NEGATIVE_PROMPT =
  "social media, bright colors, saturated, text overlay, UI elements, faces, people, portrait, selfie, high contrast, vibrant, cartoon, illustration";
