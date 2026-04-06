# ohm.

Where your thoughts find someone.

## Source Of Truth

The canonical product spec for this repo is:

- `/Users/jeonghaein/Desktop/ohm_spec.txt`

This repository now follows that document for vocabulary, product behavior, prompts, and design direction.

## Core Loop

Post a thought. Someone replies. You accept. You talk.

Three screens only:

- Worlds: the discovery feed and inline notification panel
- Conversations: accepted one-on-one threads only
- Me: your profile surface and deck

There is no follow, like, react, count badge, or popularity mechanic.

## Product Vocabulary

- Thought: one image, one sentence, up to 600 characters of context
- Reply: written text only
- Accept: creates a conversation
- Ignore: silently removes a pending reply
- Conversation: the accepted thread that starts from a reply
- Crossing: a private shared artifact that lives on both profiles
- Shift: a before/after arc that can appear in Worlds while the thread stays private

## Implementation Notes

The algorithm spec moved from "underlying question matching" to "resonance signature" generation.

Current runtime compatibility choices:

- The LLM now generates a resonance signature JSON shape.
- The primary resonance embedding is still stored in the legacy `question_embedding` column so the live feed pipeline keeps working.
- `quality_score` is now treated as an openness-weighted signal.
- Profile `interests` remain an internal cold-start fallback but are no longer shown on the visible profile surface.

## Repo Areas

- [`/Users/jeonghaein/Desktop/ohm-app/mobile`](./mobile): Expo mobile client
- [`/Users/jeonghaein/Desktop/ohm-app/api`](./api): Fastify API, feed logic, auth, routes
- [`/Users/jeonghaein/Desktop/ohm-app/docs`](./docs): spec mirrors and implementation guidance
- [`/Users/jeonghaein/Desktop/ohm-app/ml`](./ml): auxiliary ML services and local experimentation

## Secrets & Local Setup

- Real secrets stay local in ignored files like `api/.env.local`, `api/.env`, and `mobile/.env.local`.
- Share setup values with teammates through a secure channel, not Git.
- Before pushing, run `npm run check:secrets`.
- Local setup and collaboration notes live in [`/Users/jeonghaein/Desktop/ohm-app/docs/setup-local.md`](./docs/setup-local.md).

## Current Priorities

- Keep the feed centered on resonance, not topic similarity
- Preserve the acceptance gate before replies become conversations
- Keep the UI quiet: warm, analog, low-friction, and non-performative
- Avoid exposing metrics or urgency signals anywhere in the product
