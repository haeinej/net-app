# CLAUDE.md — ohm. project memory

## What is ohm.?

A social app for asynchronous, reflective conversation. No followers, likes, or metrics. Users post one thought at a time (200-char sentence + 600-char context), discover others via a resonance-driven feed, and build 1-on-1 conversations that can evolve into collaborative "crossings" and "shifts."

**Core loop:** Post thought → Discover in feed → Someone replies → Author accepts → Conversation starts → Eventually co-create crossings/shifts → Both appear back in feed

## Monorepo structure

```
ohm-app/
├── api/           # Fastify 5 backend (Node 22+, TypeScript)
├── mobile/        # Expo SDK 54 + React Native 0.81 (Expo Router)
├── ohm_website/   # Public website
├── ml/            # ML experimentation
├── docs/          # Specs & algorithm docs
└── TECH_SPEC.md   # Canonical technical specification
```

## Tech stack

### API (`/api`)
- **Framework:** Fastify 5
- **Database:** PostgreSQL + pgvector (768-dim embeddings)
- **ORM:** Drizzle ORM (schema at `api/src/db/schema.ts`, migrations in `api/drizzle/`)
- **Auth:** JWT (7-day expiry) + bcrypt
- **External services:** fal.ai (image gen), Nodemailer (SMTP), Ollama (dev embeddings)
- **Cron:** node-cron (daily/weekly learning jobs, hourly retry)

### Mobile (`/mobile`)
- **Framework:** React Native 0.81 + Expo SDK 54
- **Routing:** Expo Router (file-based, `mobile/app/`)
- **Animations:** Reanimated 4 + Gesture Handler 2.28
- **State:** Zustand 5 (minimal), SecureStore (auth tokens), AsyncStorage (onboarding)
- **Notifications:** expo-notifications
- **Fonts:** Sentient (body/reading), Comico (display/headings)

## Common commands

```bash
# Root
npm run typecheck          # Typecheck API + mobile
npm run verify             # Full: typecheck + build API + typecheck mobile

# API
cd api
npm run dev:watch          # Watch mode with tsx
npm run db:migrate         # Run pending migrations
npm run db:generate        # Generate migrations from schema changes
npm run typecheck          # Type-check API only

# Mobile
cd mobile
npm start                  # Expo dev server
npm run typecheck          # Type-check mobile only
npm run lint               # ESLint
npm run build:ios:testflight   # EAS build for TestFlight
npm run submit:ios:testflight  # Submit to TestFlight
```

## Key files

| Purpose | File |
|---------|------|
| DB schema | `api/src/db/schema.ts` |
| Server entry | `api/src/index.ts` |
| Feed engine | `api/src/feed/service.ts`, `retrieve.ts`, `rank.ts` |
| Auth routes | `api/src/routes/auth.ts` |
| Conversation routes | `api/src/routes/conversations.ts` |
| Push notifications | `api/src/lib/push.ts`, `mobile/lib/notifications.ts` |
| Root layout | `mobile/app/_layout.tsx` |
| Tab layout | `mobile/app/(tabs)/_layout.tsx` |
| Feed screen | `mobile/app/(tabs)/index.tsx` |
| Swipe card | `mobile/components/SwipeableThoughtCard.tsx` |
| API client | `mobile/lib/api.ts` |
| Auth store | `mobile/lib/auth-store.ts` |
| Color tokens | `mobile/theme/colors.ts` |
| Typography | `mobile/theme/typography.ts` |
| Tech spec | `TECH_SPEC.md` |

## Architecture notes

### Feed recommendation
Retrieve (kNN on embeddings: resonance + adjacent + wildcards) → Rank (quality * qW + domain affinity * dW + freshness * fW + engagement * rW + alpha * temporal_resonance) → Diversity filter (max 1 per author, avoid concentration clustering) → Cache (5-min TTL)

### Engagement tracking
Mobile tracks: `view_p1`, `swipe_p2`, `swipe_p3`, `type_start`, `reply_sent`, `reply_accepted`. Sent via `useEngagementTracking` hook. Daily cron updates per-user ranking weights from engagement history.

### Collaborative features
- **Crossings:** After 8+ messages, both contribute sentences → merged thought posted to feed
- **Shifts:** Every 8 messages, before/after reflection pairs → both mark ready → posted

### Push notifications
Three types: `notifyNewReply`, `notifyNewMessage`, `notifyResonanceMilestone`. Sent via Expo Push API. Deep links route to correct screen on tap.

## Design system rules

- **VERMILLION (#EB4101):** Max 5 uses — warmth bar, reply label, notification dot, post button, logo
- **No pure black.** Use `TYPE_DARK` (#1A1A16)
- **Warm palette:** `WARM_GROUND` (#F5F0EA) background, `CARD_GROUND` (#EDE8E2) cards
- **Light mode only, portrait only**
- **Card radius:** 14px. Screen padding: 16px. Card gap: 12px
- **Compact cards:** 190px height (3 visible in feed viewport)

## Deployment

- **API:** Render.com (auto-deploy from main, `render.yaml`)
- **Mobile:** EAS Build → TestFlight (preview profile) → App Store (production profile)
- **Branch:** `main` is primary. Currently working on `brand-guide-and-design-system`

## Environment variables

**API:** `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `FAL_KEY`, `OLLAMA_URL`, `INTERNAL_METRICS_KEY`
**Mobile:** `EXPO_PUBLIC_API_URL`

## Known patterns & gotchas

- **Hermes runtime:** `runOnJS` callbacks must use stable refs (not inline closures) to avoid GC crash on iOS
- **Conversations:** Use 8-sec polling (WebSocket registered but not active)
- **Soft deletes:** Thoughts use `deletedAt` column, not hard delete
- **Email normalization:** Lowercased + trimmed before storage/lookup
- **No test framework:** Validation is via TypeScript type-checking + ESLint only
- **package-lock.json:** Mobile lock file can conflict frequently; prefer local version on merge
