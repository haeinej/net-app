"use strict";
/**
 * Image generation config (Phase 4). fal.ai Flux + IP-Adapter.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEGATIVE_PROMPT = exports.CINEMATIC_SUFFIX = exports.imageConfig = void 0;
exports.imageConfig = {
    falKey: process.env.FAL_KEY ?? process.env.FAL_CREDENTIALS,
    /** S3/R2 bucket for permanent storage; if unset, fal URL is returned as-is */
    storageBucket: process.env.IMAGE_STORAGE_BUCKET,
    /** CDN prefix for final image URLs (e.g. https://cdn.example.com/images) */
    cdnUrl: process.env.IMAGE_CDN_URL ?? "",
    /** Max images per user per calendar day */
    dailyCapPerUser: 20,
    /** fal-ai/flux/dev supports direct profile-photo conditioning */
    fluxEndpoint: "fal-ai/flux/dev",
    /** fal-ai/flux-general/image-to-image for second-pass (crossing) */
    fluxImageToImageEndpoint: "fal-ai/flux-general/image-to-image",
    /** IP-Adapter scale: mood/palette influence, not literal face (0.3–0.4) */
    ipAdapterScale: 0.35,
    guidanceScale: 3.5,
    numInferenceSteps: 28,
    imageWidth: 1024,
    imageHeight: 768,
    /** Legacy config kept for compatibility with older image-to-image paths. */
    ipAdapterPath: process.env.FAL_IP_ADAPTER_PATH,
    ipAdapterImageEncoderPath: process.env.FAL_IP_ADAPTER_IMAGE_ENCODER ?? "openai/clip-vit-large-patch14",
    requestTimeoutMs: 60_000,
};
exports.CINEMATIC_SUFFIX = "Polished imaginative scene, soft cinematic lighting, subtle film grain, grounded textures, muted but rich color palette, expressive subject, no text, no UI, no watermark";
exports.NEGATIVE_PROMPT = "text overlay, UI elements, watermark, duplicate people, extra limbs, deformed hands, blurry face, low detail, oversaturated colors";
