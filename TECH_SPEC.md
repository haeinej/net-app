# ohm. — Technical Specification

**Version:** 1.0.0
**Last updated:** 2026-03-14
**Status:** Review draft

---

## 1. What ohm. is

ohm. is a social app for sharing thoughts and forming connections through asynchronous, reflective conversation. Users post short thoughts with optional images and context. Other users discover these thoughts in a recommendation-driven feed, and can reply privately. If the thought's author accepts a reply, a private conversation opens between them. Over time, conversation partners can co-create "crossings" (merged thoughts) and "collaborative cards" (before/after perspective shifts).

There are no followers, likes, or public profiles. The core loop is: **post → discover → reply → converse → collaborate**.

---

## 2. High-level architecture

| Layer | Stack |
|-------|-------|
| Mobile client | React Native 0.81 + Expo SDK 54, Expo Router, Reanimated 4, Gesture Handler, Zustand |
| API server | Fastify 5 (Node.js), JWT auth, WebSocket support |
| Database | PostgreSQL with pgvector (768-dim embeddings), Drizzle ORM |
| ML/Embeddings | Vector similarity search (HNSW indexes), learned recommendation weights |
| External services | fal.ai (image generation), Nodemailer (SMTP email), optional S3 (media storage) |
| Scheduling | node-cron (daily/weekly learning jobs, failed job retry) |

---

## 3. Authentication

### 3.1 Registration

1. User submits name, photo URL, email, and password.
2. Password must be 10+ characters with at least one lowercase, uppercase, digit, and symbol.
3. Email is normalized (trimmed, lowercased). If an unverified user with that email already exists, their record is updated rather than duplicated.
4. A 6-digit verification code is generated (`crypto.randomInt`), HMAC-SHA256 hashed, and stored with a 15-minute TTL. Any previous active codes for that user are marked consumed.
5. The code is emailed via SMTP (in dev mode, logged to console if SMTP is not configured).
6. The endpoint returns `202 { verification_required: true }` — no token is issued yet.

### 3.2 Email verification

1. User submits email + 6-digit code.
2. Server hashes the submitted code with HMAC-SHA256 and compares against the stored hash.
3. On match: the code is marked consumed, `emailVerifiedAt` is set on the user, and a JWT is returned.
4. On failure: returns 400 (expired or incorrect).

### 3.3 Login

1. User submits email + password.
2. Server verifies bcrypt hash, then checks `emailVerifiedAt` is present.
3. Returns JWT + user ID + onboarding state. Returns 403 if email is not verified, 401 if credentials are wrong.

### 3.4 Resend verification

Always returns 202 regardless of whether the email exists or is already verified, to prevent user enumeration.

### 3.5 JWT

- Payload: `{ sub: userId }`
- Expiry: configurable via `JWT_EXPIRES_IN` (default 7 days)
- Secret must be 32+ characters

### 3.6 Rate limits

| Endpoint | Limit |
|----------|-------|
| Global | 60 req/min per user or IP |
| Register | 10 req/min per IP |
| Login | 20 req/min per IP |
| Verify email | 20 req/min per IP |
| Resend verification | 10 req/min per IP |
| Send message | 30 req/min per user |

---

## 4. Data model

### 4.1 Users

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| name | text | Display name |
| photoUrl | text | Profile photo URL |
| email | text | Unique, normalized |
| passwordHash | text | bcrypt |
| emailVerifiedAt | timestamp | Null until verified |
| cohortYear | int | Used in recommendation scoring |
| currentCity | text | Optional |
| concentration | text | Academic/professional focus area |
| interests | text[] | Max 3 items |
| createdAt | timestamp | |

### 4.2 Thoughts

A thought is the atomic content unit — a short sentence with optional context and image.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | |
| userId | UUID | Author |
| sentence | text | Max 200 chars |
| context | text | Max 600 chars, deeper explanation |
| photoUrl | text | User-uploaded photo |
| imageUrl | text | AI-generated image (fal.ai) |
| surfaceEmbedding | vector(768) | For adjacent-territory retrieval |
| questionEmbedding | vector(768) | For resonance-based retrieval |
| qualityScore | float | Computed during processing |
| clusterId | int | Assigned by weekly clustering job |
| deletedAt | timestamp | Soft delete |
| createdAt | timestamp | |

On creation, `processNewThought()` runs asynchronously to generate embeddings, a quality score, and optionally an AI image.

### 4.3 Replies

| Field | Type | Notes |
|-------|------|-------|
| thoughtId | UUID | |
| replierId | UUID | |
| text | text | 50–300 chars |
| status | enum | `pending` → `accepted` or `deleted` |
| createdAt | timestamp | |

Rules:
- A user cannot reply to their own thought.
- A user can only have one pending reply per thought.
- Only the thought author can accept or delete a reply.

### 4.4 Conversations

Created atomically when a reply is accepted (idempotent on replyId).

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | |
| thoughtId | UUID | Originating thought |
| replyId | UUID | Unique — prevents duplicate conversations |
| participantA | UUID | Thought author |
| participantB | UUID | Replier |
| messageCount | int | Incremented per message |
| lastMessageAt | timestamp | |
| participantASeenAt | timestamp | Read receipt for A |
| participantBSeenAt | timestamp | Read receipt for B |
| isDormant | bool | Set true after 14+ days inactive |

When the first message is sent after dormancy, `isDormant` flips back to false. Engagement events are tracked at message count milestones (5, 10, 20).

### 4.5 Messages

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | |
| conversationId | UUID | |
| senderId | UUID | |
| text | text | |
| createdAt | timestamp | |

Cursor-paginated via `before_id`, max 50 per page. Reading messages updates the participant's seen timestamp.

### 4.6 Crossings (collaborative thoughts)

Crossings are co-authored thoughts that two conversation partners create together. They require 8+ messages in the conversation before unlocking.

**Draft lifecycle:** `draft` → `complete` or `abandoned`

| Draft fields | |
|---|---|
| conversationId | Links to conversation |
| initiatorId | Who started it |
| sentenceA, sentenceB | Each participant's contribution |
| context | Shared context (max 600 chars) |
| status | draft / complete / abandoned |

**Completed crossing:**

| Field | Notes |
|---|---|
| sentence | Final merged sentence |
| context | Optional |
| imageUrl | Optional AI-generated |
| participantA, participantB | Both credited |

Completed crossings appear in the feed and are viewable by anyone. Other users can reply to crossings (same 50–300 char constraint), targeting a specific participant.

### 4.7 Collaborative cards / Shifts (before/after reflections)

Shifts are before/after perspective exchanges. They unlock every 8 messages (at message counts 8, 16, 24, …).

**Draft lifecycle:** `draft` → `complete` or `abandoned`

Both participants must mark themselves as ready before completion. Each participant fills in their own `before` and `after` text (max 500 chars each). All four fields must be present to complete.

Completed shifts appear in the feed and on user profiles.

### 4.8 Crossing replies

Other users can reply to completed crossings, targeting either participant. Same pending/accepted/deleted status flow as thought replies.

---

## 5. Feed and recommendation engine

The feed is the primary discovery surface. It returns a mixed list of thoughts, crossings, and collaborative cards.

### 5.1 Retrieval (candidate generation)

Three buckets of candidates are fetched:

1. **Resonance matches** — kNN search on `questionEmbedding` against the viewer's own thought embeddings. Finds thoughts that ask similar questions.
2. **Adjacent territory** — kNN search on `surfaceEmbedding`. Finds thoughts in nearby topic space.
3. **Wild cards** — Random recent thoughts + surface similarity fallback. Ensures serendipity.

Candidates are filtered to exclude the viewer's own thoughts, deleted thoughts, and previously seen items.

### 5.2 Scoring

Each candidate is scored on four dimensions:

| Factor | Symbol | What it measures |
|--------|--------|-----------------|
| Quality/resonance | Q | Embedding similarity to viewer's thoughts |
| Domain affinity | D | How well the author's concentration pairs with the viewer's (from `crossDomainAffinity` table) |
| Freshness | F | Recency bias |
| Engagement signal | R | Reply/conversation rates from `crossClusterAffinity` |

Final score: `qWeight*Q + dWeight*D + fWeight*F + rWeight*R + alpha * temporal_resonance`

Weights are per-user and learned over time by daily/weekly jobs.

### 5.3 User stages

| Stage | Condition | Bucket ratio |
|-------|-----------|-------------|
| new | Just joined | Higher wild card ratio |
| building | Some thoughts posted | Balanced |
| established | Active history | Higher resonance ratio |
| wanderer | Low recent activity | More adjacent + wild |

### 5.4 Diversity and interspersion

- Concentration-based diversity: avoids showing too many thoughts from the same academic domain in a row.
- 15% of final feed items are wild cards randomly interspersed.

### 5.5 Caching

Per-user in-memory cache with 5-minute TTL, max 100 items. Invalidated when the user posts, deletes, or receives an accepted reply/crossing/shift.

---

## 6. Engagement tracking

User interactions are tracked as engagement events for the learning system:

| Event | When |
|-------|------|
| `view_p1` | Thought panel 1 viewed for 1+ second |
| `swipe_p2` | User swipes to context panel |
| `swipe_p3` | User swipes to replies panel |
| `type_start` | User begins typing a reply |
| `reply_sent` | Reply submitted |
| `reply_accepted` | Author accepts a reply |

These events feed into the recommendation weight learning jobs and quality scoring.

---

## 7. Learning system (cron jobs)

### 7.1 Daily learning (3:00 AM UTC)

- Updates per-user recommendation weights (Q/D/F/R/alpha) based on recent engagement.
- Updates cross-domain affinity table (which concentration pairs produce sustained conversations).
- Updates system config (total engagement event count).

### 7.2 Weekly learning (Sunday 4:00 AM UTC)

- Runs K-means clustering on thought embeddings → assigns `clusterId` to thoughts.
- Computes cross-cluster affinity (reply rate, conversation rate, sustain rate, average depth between cluster pairs).
- Computes temporal resonance metrics.

### 7.3 Failed job retry (every hour at :30)

- Retries failed embedding generation and image generation jobs (from `failedProcessingJobs` table) with retry count tracking.

All learning jobs use a distributed lock (`learningJobLock` table) to prevent concurrent execution.

---

## 8. Mobile client

### 8.1 Navigation

```
Root Stack
├── index (splash / session check)
├── intro (video welcome)
├── login
├── verify-email
├── onboarding (3-step: identity → interests → first thought)
├── (tabs)
│   ├── Worlds (feed)
│   ├── Conversations (list)
│   └── Me (profile)
├── post (modal)
├── thought/[id] (detail)
├── conversation/[id] (chat)
└── user/[id] (other user's profile)
```

### 8.2 Onboarding flow

1. **Identity** — Name, photo, email, password → triggers registration → redirects to email verification.
2. **Interests** — Three free-text fields ("what you keep returning to", "what is taking your attention", "what feels quietly important") → saved via profile update.
3. **First thought** — Compose first thought with photo, sentence (200 chars), and context (600 chars) → posts thought → enters main app.

Onboarding step is tracked server-side and persisted locally. Users re-entering the app resume where they left off.

### 8.3 Thought cards (3-panel swipe)

Each thought in the feed is a compact card (190px) with horizontal swipe navigation:

- **Panel 0:** Image with sentence overlay, author footer, swipe-hint dots.
- **Panel 1:** Full context text on dark background (#0C0C0A).
- **Panel 2:** Replies list with reply input on dark background (#080604).

Swiping uses spring-based animations (damping: 28, stiffness: 320) with haptic feedback. Panel state is persisted in AsyncStorage so users return to where they left off.

### 8.4 Conversation screen

- Message thread with cursor-based pagination (loads older on scroll-up).
- 8-second polling interval for new messages and collaborative card state.
- Collaborative card section shows current shift draft progress (before/after for each participant).
- Message count triggers encourage collaborative features (every 8 messages).
- Gradient color progression warms as message count increases.

### 8.5 Notifications

Overlay panel showing pending replies on the user's thoughts. Each notification shows the replier, a preview of their reply, and the thought they replied to. Actions: "Reply in chat" (accept) or "Ignore" (delete).

### 8.6 Walkthrough

First-time users get a 5-step spotlight tour: welcome → post button → feed card → reply flow → conversations tab.

### 8.7 State management

- **Auth:** SecureStore (token, userId), AsyncStorage (onboarding state).
- **Feed/data:** Direct API calls with local state via `useState` — no global store for content.
- **Card panel memory:** AsyncStorage keyed by card ID.
- **Engagement:** Custom `useEngagementTracking` hook with debounced event dispatch.

---

## 9. Design system

### 9.1 Color palette

| Token | Hex | Usage |
|-------|-----|-------|
| WARM_GROUND | #F5F0EA | Primary background |
| CARD_GROUND | #EDE8E2 | Card backgrounds |
| VERMILLION | #EB4101 | 5 uses max: warmth bar, reply label, notification dot, post button, logo period |
| OLIVE | #979C5B | Secondary actions, crossing replies |
| CHARTREUSE | #D0D37C | Accent |
| PANEL_DARK | #0C0C0A | Thought detail panels |
| PANEL_DEEP | #080604 | Deepest panel background |
| TYPE_DARK | #1A1A16 | Primary text (never pure black) |
| TYPE_MUTED | #9A9A98 | Secondary/disabled text |

### 9.2 Typography

Two typefaces:
- **Sentient** (Medium, Bold) — Reading text, thought sentences, body copy.
- **Comico** (Regular) — Display/structural: headings, labels, buttons.

Key sizes: 32px (profile heading), 24px (thought display), 22px (card overlay), 16px (body/compact thought), 14px (labels), 12px (small labels), 10.5px (captions).

### 9.3 Spacing and cards

- Screen padding: 16px
- Card gap: 12px, card radius: 14px
- Warmth bar: 4px wide, left edge
- Compact card height: 190px (3 visible in feed viewport)
- Flat cards in light mode (no drop shadows), raised shadows on buttons/notification dots only
- Dark panels use soft borders instead of shadows

---

## 10. API endpoint reference

### Auth
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | /api/auth/register | No | Returns 202, sends verification email |
| POST | /api/auth/verify-email | No | Returns JWT on success |
| POST | /api/auth/resend-verification | No | Always 202 |
| POST | /api/auth/login | No | Returns JWT + onboarding state |

### Thoughts
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | /api/thoughts | Yes | Create thought (200 char sentence, 600 char context) |
| GET | /api/thoughts/:id | Yes | 3-panel detail response |
| PUT | /api/thoughts/:id | Yes | Owner only, partial update |
| DELETE | /api/thoughts/:id | Yes | Owner only, soft delete |

### Feed
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /api/feed | Yes | `?limit=20&offset=0`, returns mixed items |

### Replies
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | /api/thoughts/:id/reply | Yes | 50–300 chars, not own thought |
| POST | /api/replies/:id/accept | Yes | Thought owner only, creates conversation |
| POST | /api/replies/:id/delete | Yes | Thought owner only |

### Conversations
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /api/conversations | Yes | List with unread/dormant flags |
| GET | /api/conversations/:id | Yes | Metadata + draft states |
| GET | /api/conversations/:id/messages | Yes | Cursor pagination, marks read |
| POST | /api/conversations/:id/messages | Yes | Send message |

### Crossings
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | /api/conversations/:id/crossing/start | Yes | Requires 8+ messages |
| GET | /api/conversations/:id/crossing | Yes | Current draft |
| PUT | /api/conversations/:id/crossing | Yes | Update draft |
| POST | /api/conversations/:id/crossing/complete | Yes | Finalize |
| POST | /api/conversations/:id/crossing/abandon | Yes | |
| GET | /api/crossings/:id | Yes | Public view, 3-panel |
| POST | /api/crossings/:id/reply | Yes | Non-participant, 50–300 chars |

### Shifts (collaborative cards)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | /api/conversations/:id/shift/start | Yes | Unlocks every 8 messages |
| GET | /api/conversations/:id/shift | Yes | Current draft |
| PUT | /api/conversations/:id/shift | Yes | Update own side |
| POST | /api/conversations/:id/shift/complete | Yes | Both must be ready |
| POST | /api/conversations/:id/shift/abandon | Yes | |
| POST | /api/conversations/:id/shift/ignore | Yes | Cascading delete |

### Profile
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /api/users/:id/profile | Yes | Public profile + content |
| PUT | /api/me/profile | Yes | Update own profile |
| DELETE | /api/me/account | Yes | Requires password, cascading delete |

### Notifications
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /api/notifications | Yes | Pending replies on own thoughts |

### System
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /health | No | Returns `{ status: "ok" }` |

---

## 11. Infrastructure notes

- **Build:** Custom TypeScript build script with atomic swap (temp dir → dist). Separate typecheck script (no emit).
- **Database migrations:** Drizzle Kit. Migration files in `api/drizzle/`.
- **CORS:** Dev patterns (localhost, 127.0.0.1, exp://) + configurable production origins.
- **Mobile builds:** EAS Build (Expo Application Services) with TestFlight and production profiles.
- **Image generation:** fal.ai client, tracked per user in `imageGenerations` table (supports daily caps).
- **Vector indexes:** HNSW on both surface and question embeddings (768-dim, cosine distance).

---

## 12. Open questions / areas for review

- [ ] WebSocket is registered but no real-time messaging implementation is visible — conversations use 8-second polling. Is WS intended for a future iteration?
- [ ] The `cohortYear` and `concentration` fields are referenced in recommendation scoring but there's no onboarding step that collects them. How are these populated?
- [ ] Image generation (fal.ai) daily cap logic exists in schema but enforcement isn't visible in routes. Is this handled in `processNewThought()`?
- [ ] The `shift/ignore` endpoint cascading-deletes the entire conversation (messages, crossings, replies). Is this the intended UX for ignoring a collaborative card?
- [ ] No push notification infrastructure is visible. Is this planned?
- [ ] Password reset flow does not exist yet. Is this pre-launch blocking?
