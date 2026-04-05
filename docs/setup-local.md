# Local Setup

This repo is safe to share on GitHub only if real credentials stay out of tracked files.

## What stays local

- `api/.env.local`
- `api/.env`
- `mobile/.env.local`
- any downloaded key material such as `.pem`, `.p8`, `.key`, `GoogleService-Info.plist`, or `google-services.json`

These files are intentionally ignored by Git and should never be committed.

## What is safe to commit

- `api/.env.example`
- `mobile/.env.example`
- `mobile/.env.production.example`
- docs that describe which variables are required

Use the example files as templates only.

## New Mac setup

1. Clone the repo.
2. Copy the example env files:

```bash
cp api/.env.example api/.env.local
cp mobile/.env.example mobile/.env.local
```

3. Fill in the real values locally.
4. Run the app:

```bash
cd api && npm run dev:watch
```

```bash
cd mobile && npm start
```

## Hosted environments

- Fly.io secrets belong in Fly, not in the repo.
- Expo public runtime values belong in EAS environment config, not in the repo.
- If you create a staging environment, give collaborators staging credentials first and keep production credentials separate.

## Sharing with another developer

1. Give them repo access.
2. Send secrets through a secure channel such as 1Password, Bitwarden, or another secret manager.
3. Have them create their own local env files from the examples.
4. Ask them to run:

```bash
npm run check:secrets
```

before pushing.

## Quick rule

If a value would let someone access your database, auth provider, push service, or Apple/Google configuration, it should live in a local env file or a hosted secret manager, not in Git.
