"""
Image generation — Phase 4 of the algorithm build.

fal.ai Flux Dev + IP-Adapter (ip_adapter_scale 0.3-0.4)
Every image: cinematic landscape, desaturated, low contrast, film grain.
"""

import os
import fal_client
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

STYLE_SUFFIX = "cinematic landscape, desaturated, film grain, low contrast, atmospheric"
NEGATIVE_PROMPT = "faces, people, portrait, bright colors, saturated, text overlay"


class ImageRequest(BaseModel):
    thought_id: str
    sentence: str
    profile_photo_url: str          # used as IP-Adapter reference
    ip_adapter_scale: float = 0.35  # 0.3–0.4 per spec


class CrossingImageRequest(BaseModel):
    thought_id: str
    sentence: str
    profile_photo_url_a: str
    profile_photo_url_b: str
    ip_adapter_scale: float = 0.35


class ImageResponse(BaseModel):
    thought_id: str
    image_url: str


@router.post("/thought", response_model=ImageResponse)
async def generate_thought_image(req: ImageRequest):
    """Generate a cinematic landscape for a single thought."""
    prompt = f"{req.sentence}, {STYLE_SUFFIX}"

    try:
        result = await fal_client.run_async(
            "fal-ai/flux/dev",
            arguments={
                "prompt": prompt,
                "negative_prompt": NEGATIVE_PROMPT,
                "ip_adapter_image_url": req.profile_photo_url,
                "ip_adapter_scale": req.ip_adapter_scale,
                "num_inference_steps": 28,
                "guidance_scale": 3.5,
            },
        )
        return ImageResponse(thought_id=req.thought_id, image_url=result["images"][0]["url"])
    except Exception as e:
        raise HTTPException(500, f"Image generation failed: {e}")


@router.post("/crossing", response_model=ImageResponse)
async def generate_crossing_image(req: CrossingImageRequest):
    """Generate a crossing image using both participants' profile photos."""
    prompt = f"{req.sentence}, {STYLE_SUFFIX}"

    try:
        result = await fal_client.run_async(
            "fal-ai/flux/dev",
            arguments={
                "prompt": prompt,
                "negative_prompt": NEGATIVE_PROMPT,
                "ip_adapter_image_urls": [req.profile_photo_url_a, req.profile_photo_url_b],
                "ip_adapter_scale": req.ip_adapter_scale,
                "num_inference_steps": 28,
                "guidance_scale": 3.5,
            },
        )
        return ImageResponse(thought_id=req.thought_id, image_url=result["images"][0]["url"])
    except Exception as e:
        raise HTTPException(500, f"Crossing image generation failed: {e}")
