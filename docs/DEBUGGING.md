# Debugging net. setup

**Stack:** Database + Auth = Supabase free tier. Embeddings + Question LLM = Ollama on your Mac (no Docker). API server = run locally on your Mac.

Migrations are verified to run successfully against Supabase when using the **connection pooler** URL (port 6543). Use this guide if the API or migrations fail to connect.

## 1. Database: "EHOSTUNREACH" or connection fails

**Symptom:** `Error: connect EHOSTUNREACH 2600:1f13:...:5432` when running `npm run db:migrate` or starting the API.

**Cause:** Your Supabase **direct** connection URL (`db.xxx.supabase.co:5432`) can resolve to IPv6. Many networks don’t reach that, so the connection fails.

**Fix:** Use the **Connection pooler** URL instead of the direct one.

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. **Project Settings** (gear) → **Database**.
3. Under **Connection string**, choose **URI**.
4. Use the **Connection pooling** section (not “Direct connection”).
   - Mode: **Session** or **Transaction**.
   - Copy the URI. It should look like:
     ```txt
     postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
     ```
     (port **6543**, host `pooler.supabase.com`).
5. In `api/.env`, set:
   ```env
   DATABASE_URL=postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
   ```
   Replace `PROJECT_REF`, `YOUR_PASSWORD`, and `REGION` with the values from the dashboard.

**Optional: test the new URL before migrating**

From repo root (or from `api/`):

```bash
cd api && npm run db:ping
```

You should see `OK — DB connection works.` If you still see EHOSTUNREACH, double-check that the URL uses port **6543** and the host contains **pooler.supabase.com**.

Then run migrations:

```bash
cd api && npm run db:migrate
```

---

## 2. "No such file or directory" when running commands

**Symptom:** `bash: cd: api: No such file or directory` when you run `cd api`.

**Cause:** You’re already inside `api/` (or `mobile/`). `cd api` only works when your current directory is the **repo root** (`net-app/`).

**Fix:** Run from repo root.

- Repo root: `/Users/jeonghaein/Desktop/net-app` (where you see `api/`, `mobile/`, `docs/`).
- From repo root:
  ```bash
  cd api && npm run db:migrate   # run migrations
  cd api && npm run dev          # start API
  cd mobile && npm start         # start Expo
  ```
- If your terminal is already in `api/`:
  ```bash
  npm run db:migrate   # no "cd api"
  npm run dev
  ```
- To start the ML service (optional):
  ```bash
  cd /Users/jeonghaein/Desktop/net-app
  cd ml && uvicorn main:app --reload --port 8000
  ```

---

## 3. Quick checklist

| Step | Where | Command |
|------|--------|--------|
| 1. Use pooler DB URL | `api/.env` | See section 1 above |
| 2. Run migrations | From repo root | `cd api && npm run db:migrate` |
| 3. Start API | From repo root | `cd api && npm run dev` |
| 4. Start mobile | From repo root | `cd mobile && npm start` |
| 5. Ollama (Mac app, no Docker) | Install from ollama.com | `ollama pull mistral` and `ollama pull nomic-embed-text` |
| 6. (Optional) ML service | From repo root | `cd ml && uvicorn main:app --reload --port 8000` |

---

## 4. Test that the API and DB are OK

From repo root:

```bash
cd api && npm run dev
```

In another terminal:

```bash
curl -s http://localhost:3000/health
# Should return: {"status":"ok"}
```

If you see `{"status":"ok"}`, the API is up. If migrations have been run, the DB connection is working.

---

## 5. Mobile can’t reach the API

- **Device/simulator:** Use your machine’s IP, not `localhost`. In `mobile/.env` or in the Expo env:
  ```env
  EXPO_PUBLIC_API_URL=http://YOUR_MACHINE_IP:3000
  ```
  Example (Mac): run `ipconfig getifaddr en0` and use that IP.
- **iOS simulator:** `http://localhost:3000` often works.
- **Android emulator:** Use `http://10.0.2.2:3000` instead of `localhost`.
