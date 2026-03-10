# Debugging

Use this file when the runtime drifts from the March 10, 2026 core spec.

## Thought Pipeline

- New thoughts should trigger asynchronous thought processing immediately after creation.
- The processor now asks the LLM for a resonance signature JSON payload.
- The feed still reads the primary resonance embedding from the legacy `question_embedding` column.
- `quality_score` should roughly track openness, not generic engagement.

If a thought posts but never appears in the feed, inspect:

- `failed_processing_jobs`
- `surface_embedding`
- `question_embedding`
- image generation failures

## Reply Gate

- Replies must stay pending until explicitly accepted.
- Valid reply length is 50 to 300 characters.
- Ignore must be silent. No signal goes back to the sender.
- Accept must create a conversation whose first message is the original reply.

If replies are bypassing the gate, inspect:

- `/api/thoughts/:id/reply`
- `/api/replies/:id/accept`
- `/api/replies/:id/ignore`
- `/api/notifications`

## Feed Checks

Worlds should feel like retrieval, not chronology.

Check:

- viewer resonance embeddings load correctly
- cold-start fallback only runs when the viewer has no processed thoughts
- deleted thoughts are excluded
- shifts can appear in Worlds
- crossings never appear in Worlds

## UI Checks

- Notification circle appears only when pending replies exist
- Notification panel opens inline from Worlds
- Profiles do not visibly render the internal interests list
- Conversations never show network-style affordances
- No counts appear anywhere in the client
