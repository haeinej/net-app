# Algorithm Overview

The March 2026 spec replaces the old question-matching language with resonance signatures.

## What The System Optimizes For

- resonance over topic similarity
- creative collisions over comfort-zone repetition
- replies over passive viewing
- retrieval over on-request LLM ranking

## Resonance Signature

Each thought is processed into hidden metadata:

- tensions
- domains of human experience
- openness
- abstraction
- resonance phrases

The runtime currently stores the primary resonance embedding in the legacy `question_embedding` column for compatibility.

## Feed Composition

Worlds is built from three buckets:

- resonance matches
- adjacent territory
- wild cards

The system should never become:

- a popularity engine
- a chronology-first feed
- a topic-silo recommender
- an urgency machine
