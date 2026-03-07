# net.

*Thoughts that connect people.*

A platform where a single sentence becomes an invitation — and strangers who resonate start a conversation.

---

## The Loop

**Post a thought → someone replies → you accept → you talk.**

That's it. No feeds to scroll, no follower counts, no algorithmic dopamine. Just one thought, one reply, one conversation at a time.

---

## The Problem

Intellectual loneliness — the sensation of lacking resonance despite abundant digital connections. People hunger for genuine encounter but reach for safer substitutes. net. is built to close that gap.

---

## How It Works

A thought is a single sentence + up to 3 sentences of context. The system deliberately creates gaps — enough to invite a response, not enough to foreclose it.

Every thought gets an AI-generated cinematic landscape image, derived from the text + your profile photo via IP-Adapter. The image communicates tone without describing content.

The recommendation engine matches thoughts not by topic, but by **underlying question**. A philosopher writing about when rigor becomes avoidance and an engineer writing about over-optimization score high together — same question, different surfaces.

```
score = question_similarity × (1 + α × surface_distance) × quality_score
```

`surface_distance` is **rewarded**, not penalized. The feed feels like walking through a city where you keep overhearing conversations you didn't know you needed to hear.

---

## Three Screens

| Screen | Purpose |
|--------|---------|
| **Worlds** | Discovery feed — thoughts matched to your underlying questions |
| **Conversations** | Accepted dialogue threads |
| **Me** | Personal profile and thought archive |

No social graph. No follower counts. No connection requests. No "people like you."

---

## Engagement Signal

A single visual element: an orange left-edge bar that intensifies as warmth increases. No counts of any kind — ever.

`warmth_level`: `none` → `low` → `medium` → `full`

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Database | PostgreSQL + pgvector (HNSW indexes) |
| Embeddings | nomic-embed-text 768d — local TEI server or HuggingFace API |
| Question extraction | Mistral 7B / Llama 3.1 8B via Ollama (local) |
| LLM fallback | Claude Haiku or GPT-4o-mini |
| Image generation | fal.ai Flux Dev + IP-Adapter (scale 0.3–0.4) |
| Re-ranker (later) | Mistral 7B via Ollama |

All ML components have a self-hosted primary and an API fallback.

---

## Architecture

**Three-layer recommendation: embed → retrieve → rank**

1. **Embed** (on thought creation) — dual embeddings per thought:
   - Surface embedding: what the thought is topically about
   - Question embedding: what underlying question it's wrestling with (extracted by LLM, then embedded)

2. **Retrieve** (on feed request) — pgvector nearest-neighbor on `question_embeddings` → 100 candidates

3. **Rank** (application-level) — score with formula above, then enforce:
   - Cross-cohort diversity: max 40% single cohort per 10-item window
   - Freshness weighting
   - Reply quality signals

4. **Learn** (daily/weekly batch) — observe which recommendations produce real conversations (reply → accept → 10+ messages), adjust `α` per user, discover question clusters

---

## Hard Rules

- No counts in any API response — ever
- No social graph of any kind
- No engagement prompts ("you might want to reply to this")
- No interest taxonomy exposed to users
- Dormant conversations (30+ days) are never nudged
- Reply deletion is silent — the replier gets no signal
- No editing thoughts after posting
- Replies require acceptance before appearing

---

## Project Structure

```
net-app/
├── .cursorrules              ← Cursor project rules (auto-loaded)
├── .gitignore
├── docker-compose.yml        ← PostgreSQL + pgvector + Ollama
├── README.md
├── mobile/                   ← Expo (React Native) — iOS + Android
│   ├── app/
│   │   ├── _layout.tsx
│   │   └── (tabs)/
│   │       ├── index.tsx         ← Worlds (feed)
│   │       ├── conversations.tsx ← Conversations
│   │       └── me.tsx            ← Me (profile)
│   ├── app.json
│   ├── package.json
│   └── tsconfig.json
├── api/                      ← Node.js + TypeScript (Fastify)
│   ├── src/
│   │   ├── index.ts
│   │   ├── types.ts
│   │   └── db/client.ts
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── ml/                       ← Python FastAPI — embeddings + images
│   ├── main.py
│   ├── routers/
│   │   ├── embeddings.py     ← nomic-embed-text + Ollama question extraction
│   │   └── images.py         ← fal.ai Flux + IP-Adapter
│   ├── .env.example
│   └── requirements.txt
└── docs/
    ├── net-spec.txt          ← full product + design spec
    ├── algorithm/
    │   ├── README.md         ← build guide + phase order
        ├── cursorrules.txt   ← reference copy of .cursorrules
        ├── phases/
        │   ├── phase-1-database-schema.txt
        │   ├── phase-2-embedding-service.txt
        │   ├── phase-3-dual-embedding-pipeline.txt
        │   ├── phase-4-image-generation.txt
        │   ├── phase-5-matching-and-feed-ranking.txt
        │   ├── phase-6-engagement-tracking.txt
        │   ├── phase-7-learning-loop.txt
        │   └── phase-8-api-endpoints.txt
        └── testing/
            └── seed-and-test.txt
    └── frontend/
        ├── design-system.txt         ← colours, type, spacing, components
        ├── screen-1-worlds-feed.txt  ← feed layout + notification panel
        ├── screen-2-thought-panels.txt ← three-panel swipe interaction
        ├── screen-3-conversations.txt ← conversation list + thread view
        ├── screen-4-profile.txt      ← me screen + other user profiles
        ├── screen-5-compose.txt      ← thought creation flow
        ├── screen-6-onboarding.txt   ← registration + first thought
        └── screen-7-crossing-shift.txt ← collaborative artefacts
```

---

## Getting Started

### 1. Set up services (one-time)

**Supabase** (database + auth):
1. Go to [supabase.com](https://supabase.com) → New Project
2. Enable the pgvector extension: SQL Editor → `create extension vector;`
3. Copy your project URL + anon key + service role key from Settings → API

**Ollama** (embeddings + LLM — runs locally, free):
1. Download from [ollama.com](https://ollama.com) → install the Mac app
2. Pull models: `ollama pull mistral && ollama pull nomic-embed-text`

**fal.ai** (image generation):
1. Sign up at [fal.ai](https://fal.ai) → get API key from dashboard

### 2. API

```bash
cd api
cp .env.example .env   # fill in Supabase + fal.ai keys
npm install
npm run dev
```

### 3. ML service

```bash
cd ml
cp .env.example .env   # fill in Supabase + fal.ai keys
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 4. Mobile

```bash
cd mobile
npm install
npm start   # scan QR with Expo Go on your phone
```

### 5. Build the recommendation system

Open this repo in Cursor. Then follow `docs/algorithm/README.md` — paste each phase prompt into Cursor chat in order.

---

## Build Order

Start with `docs/algorithm/README.md` — it has the full phase guide.

| Phase | Builds | Effort |
|-------|--------|--------|
| 1 | PostgreSQL schema + pgvector | 1 day |
| 2 | nomic-embed-text wrapper | 0.5 day |
| 3 | Dual embedding pipeline + quality score | 1 day |
| 4 | fal.ai image generation | 0.5 day |
| 5 | Matching + feed ranking | 1.5 days |
| 6 | Engagement tracking | 0.5 day |
| 7 | Learning loop (stubs) | 1 day |
| 8 | API endpoints | 1.5 days |

Phases 2, 3, 4, 6 can run in parallel. **Total: ~7–8 days.**

---

## Initial Deployment

Minerva University — students across all active cohorts and geographic rotations, enabling cross-cohort discovery through shared thinking patterns.
