# net. Recommendation System — Cursor Implementation Guide

## How to use these files

This folder contains **8 Cursor prompts** plus a rules file and a test script. Paste each prompt directly into Cursor chat, in order. Each phase builds on the one before it.

**Before you start:**
1. Add the recommendation spec (.docx), product spec, and design spec to your Cursor project context
2. Copy the contents of `cursorrules.txt` into your `.cursorrules` file or Cursor project instructions
3. Build phases in order — each depends on the previous

---

## Tech Stack

| Component | Tool | Cost |
|-----------|------|------|
| Embeddings | nomic-embed-text (768d) via local TEI server or HuggingFace API | Free |
| Question extraction LLM | Mistral 7B / Llama 3.1 8B via Ollama (local) | Free |
| LLM fallback | Claude Haiku or GPT-4o-mini (API) | ~$0.001/thought |
| Vector search | PostgreSQL + pgvector | Free |
| Image generation | fal.ai Flux + IP-Adapter | ~$0.04/image |
| Re-ranker (later) | Mistral 7B via Ollama | Free |

---

## Build Order

| Phase | File | What it builds | Depends on | Effort |
|-------|------|---------------|------------|--------|
| 1 | `phase-1-database-schema.txt` | PostgreSQL tables + pgvector | Nothing | 1 day |
| 2 | `phase-2-embedding-service.txt` | nomic-embed-text wrapper | Phase 1 | 0.5 day |
| 3 | `phase-3-dual-embedding-pipeline.txt` | Surface + question embeddings, quality score | Phase 2 | 1 day |
| 4 | `phase-4-image-generation.txt` | fal.ai Flux + IP-Adapter pipeline | Phase 1 | 0.5 day |
| 5 | `phase-5-matching-and-feed-ranking.txt` | Three-layer ranking (retrieve → score → rank) | Phase 3 | 1.5 days |
| 6 | `phase-6-engagement-tracking.txt` | Event pipeline + analytics | Phase 1 | 0.5 day |
| 7 | `phase-7-learning-loop.txt` | Daily/weekly batch jobs that improve recs | Phases 5, 6 | 1 day (stubs) |
| 8 | `phase-8-api-endpoints.txt` | Full API layer | All above | 1.5 days |

**Total: ~7-8 days for a working system.**

Phases 2, 3, 4, and 6 can be built in parallel. Phase 7 ships as stubs — the learning logic fills in once you have real Minerva data.

---

## Architecture Summary

**Three-layer recommendation: embed → retrieve → rank**

**Layer 1 — Embed (on thought creation):**
Every thought gets two embeddings via an open-source model (nomic-embed-text):
- Surface embedding: what the thought is topically about
- Question embedding: what underlying question the person is wrestling with (extracted by LLM, then embedded)

**Layer 2 — Retrieve (on feed request):**
Use pgvector to find the 100 nearest thoughts by question_embedding similarity to the viewer's own thoughts. Fast, database-level.

**Layer 3 — Rank (application-level):**
Score each candidate using the core formula:

    score = question_similarity × (1 + α × surface_distance) × quality_score

This rewards thoughts that ask similar underlying questions from different surface topics. Then apply diversity constraints (max 40% single cohort), freshness weighting, and reply quality signals.

**Learning layer (runs daily/weekly):**
Observes which recommendations produce real conversations (reply → accept → 10+ messages) and adjusts weights per user. Discovers question clusters. Maps productive cross-domain pairings.

---

## The Core Insight

The matching formula contains a counter-intuitive element: `surface_distance` is *rewarded*, not penalized. Most recommendation systems try to minimize distance (show similar things). This system maximizes productive distance (show different things that touch the same nerve).

A philosopher writing about when rigor becomes avoidance and an engineer writing about over-optimization score HIGH together because:
- question_similarity is high (same underlying question)
- surface_distance is high (completely different topics)
- The formula multiplies these, boosted by α

The result: the feed feels like walking through a city where you keep overhearing conversations you didn't know you needed to hear.

---

## Image Generation

Each thought gets a unique cinematic landscape generated from the sentence + the user's profile photo via IP-Adapter:
- fal.ai Flux Dev as the base model
- IP-Adapter at scale 0.3-0.4 (influences mood/palette, not literal face)
- Style suffix appended to every prompt: "cinematic landscape, desaturated, film grain, low contrast, atmospheric"
- The same sentence from two different people produces visibly different images

For crossings (collaborative thoughts between two people), both profile photos are used as IP-Adapter references.

---

## Testing

After building all phases, use `seed-and-test.txt` to:
1. Create 20 test users across cohorts, cities, and concentrations
2. Create 40 thoughts including known cross-domain pairs
3. Run the full pipeline
4. Validate that cross-domain pairs rank near each other despite different topics
5. Validate that cohort diversity constraints are satisfied

---

## Files in this folder

    cursor-prompts/
    ├── phase-1-database-schema.txt
    ├── phase-2-embedding-service.txt
    ├── phase-3-dual-embedding-pipeline.txt
    ├── phase-4-image-generation.txt
    ├── phase-5-matching-and-feed-ranking.txt
    ├── phase-6-engagement-tracking.txt
    ├── phase-7-learning-loop.txt
    ├── phase-8-api-endpoints.txt
    ├── cursorrules.txt
    └── seed-and-test.txt
