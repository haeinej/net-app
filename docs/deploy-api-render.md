# Deploying the API on Render

This repo's backend is a plain Node/Fastify service in `api/`. Render can host it as a normal web service and give you a public URL such as:

`https://ohm-api.onrender.com`

You can later attach your own subdomain, for example:

`https://api.ohmmmm.com`

## Before you start

You need:

- a GitHub repo with the current code
- a Render account
- your Supabase pooled Postgres connection string

Use the pooled Supabase connection string for `DATABASE_URL`, not a local Postgres URL.

## Fastest setup

1. Push this repo to GitHub.
2. In Render, choose `New +` -> `Blueprint`.
3. Select this repo.
4. Render will detect `render.yaml`.
5. When prompted, fill:
   - `DATABASE_URL`
   - `JWT_SECRET` if you want to override the generated one
6. Create the service.

## If you prefer manual setup

Create a new `Web Service` with:

- `Root Directory`: `api`
- `Environment`: `Node`
- `Build Command`: `npm ci && npm run build`
- `Start Command`: `npm run start`

Then add environment variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN=https://www.ohmmmm.com`

Optional only if you actually use them:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`

## After deploy

1. Open the Render URL.
2. Verify `/health` returns `{"status":"ok"}`.
3. Copy the base URL, for example:
   - `https://ohm-api.onrender.com`
4. Set that in Expo/EAS:

```bash
cd /Users/jeonghaein/Desktop/ohm-app/mobile
eas env:create --name EXPO_PUBLIC_API_URL --value https://ohm-api.onrender.com --environment preview --visibility plaintext
eas env:create --name EXPO_PUBLIC_API_URL --value https://ohm-api.onrender.com --environment production --visibility plaintext
```

5. Then build for TestFlight:

```bash
cd /Users/jeonghaein/Desktop/ohm-app
npm run build:ios:testflight
npm run submit:ios:testflight
```

## Recommended next cleanup

Once the Render URL works, add a DNS record for:

- `api.ohmmmm.com`

Then switch `EXPO_PUBLIC_API_URL` to the custom domain.
