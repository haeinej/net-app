"""
Embedding service - Phase 2 + 3 of the algorithm build.

Primary (and only): nomic-embed-text via Ollama on Mac (Apple Silicon, Metal).
No Docker, no HuggingFace fallback.
"""

import os
import asyncio
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = "nomic-embed-text"


class EmbedRequest(BaseModel):
    text: str


class DualEmbedRequest(BaseModel):
    thought_id: str
    sentence: str
    context: str | None = None


class EmbedResponse(BaseModel):
    embedding: list[float]  # 768 dimensions


class DualEmbedResponse(BaseModel):
    thought_id: str
    surface_embedding: list[float]    # raw text surface
    resonance_embedding: list[float]  # primary resonance vector
    resonance_summary: str
    question_embedding: list[float]   # legacy alias for resonance_embedding
    extracted_question: str           # legacy alias for resonance_summary
    quality_score: float              # 0–1


async def embed_text(text: str) -> list[float]:
    """Embed text via Ollama (nomic-embed-text)."""
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            r = await client.post(
                f"{OLLAMA_URL}/api/embeddings",
                json={"model": EMBED_MODEL, "prompt": text},
            )
            r.raise_for_status()
            return r.json()["embedding"]
        except Exception as e:
            raise HTTPException(
                503,
                f"Ollama unavailable — make sure Ollama is running (ollama.com): {e}",
            )


async def extract_question(sentence: str, context: str | None) -> str:
    """Extract a compact resonance summary via Ollama."""
    prompt = f"""A person wrote this thought:

Sentence: {sentence}
{f'Context: {context}' if context else ''}

In one sentence, describe what this thought is really about at the level of human experience.
Do not describe the topic. Extract the deeper tension beneath the topic.
Respond with only the sentence, nothing else."""

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            r = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={"model": "mistral", "prompt": prompt, "stream": False},
            )
            r.raise_for_status()
            return r.json()["response"].strip()
        except Exception:
            # Fallback: use the sentence itself as the question
            return sentence


@router.post("/single", response_model=EmbedResponse)
async def embed_single(req: EmbedRequest):
    embedding = await embed_text(req.text)
    return EmbedResponse(embedding=embedding)


@router.post("/dual", response_model=DualEmbedResponse)
async def embed_dual(req: DualEmbedRequest):
    """Generate dual embeddings for a thought (Phase 3)."""
    full_text = req.sentence
    if req.context:
        full_text += f" {req.context}"

    extracted_question = await extract_question(req.sentence, req.context)

    surface_embedding, resonance_embedding = await asyncio.gather(
        embed_text(f"search_document: {full_text}"),
        embed_text(f"search_document: {extracted_question}"),
    )

    # Quality score: longer, more specific thoughts score higher
    word_count = len(full_text.split())
    quality_score = min(1.0, word_count / 50)

    return DualEmbedResponse(
        thought_id=req.thought_id,
        surface_embedding=surface_embedding,
        resonance_embedding=resonance_embedding,
        resonance_summary=extracted_question,
        question_embedding=resonance_embedding,
        extracted_question=extracted_question,
        quality_score=quality_score,
    )
