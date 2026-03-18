# EAS / TestFlight from this repo

## Local prep hang (`expo config --introspect`)

If `eas build` never finishes creating a build on your machine (remote build numbers increment but no new build appears), the CLI is usually stuck on:

```bash
npx expo config --json --type introspect
```

**Fix: use Node 20 LTS for the machine that runs `eas build`.**

```bash
cd mobile
nvm install   # if needed
nvm use       # reads mobile/.nvmrc → 20
npm run build:ios:testflight
```

The mobile app’s iOS build scripts run `node scripts/check-eas-node.mjs` first and **exit on Node 22+** so you don’t burn another remote build number.

## Optional: CI / another machine

Any environment with Node 20 and this repo (with `mobile/package.json` present in the upload — see root `.easignore`) can run:

```bash
cd mobile && npm ci && npx eas build --platform ios --profile testflight
```

## Metro / Watchman

If introspect still stalls after switching to Node 20, try:

```bash
export EXPO_NO_WATCHMAN=1
```

(`mobile/metro.config.js` also avoids Watchman when `CI=true` or `EXPO_NO_WATCHMAN=1`.)
