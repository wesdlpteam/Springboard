# Springboard — Deployment Runbook

This is a step-by-step guide for standing Springboard up from scratch: a public GitHub
repo serving the frontend, a Vercel project serving the API, and a Neon Postgres database
for analytics. It assumes no prior Vercel or Neon experience. Every command is
copy-pasteable.

Springboard has two halves that both need to exist before it works end to end:

- **Frontend** — `index.html` + `stats.html`, static files, hosted on **GitHub Pages**.
- **Backend** — the functions in `api/`, hosted on **Vercel**, backed by a **Neon
  Postgres** database for analytics.

They talk to each other over plain HTTPS; there is no server-side rendering and no build
step for the frontend.

## 1. Create the GitHub repo and enable Pages

> **Gate: do not run this step without Nathan's explicit OK** — it makes the code public.

1. Create a new **public** repository named `Springboard` under the `wesdlpteam`
   GitHub organisation/account. Do not initialise it with a README, `.gitignore`, or
   license — this repo already has a README and `.gitignore`, and initialising the
   remote would create a conflicting history.
2. Point this local repo at it and push:

   ```bash
   git remote add origin https://github.com/wesdlpteam/Springboard.git
   git push -u origin main
   ```
3. In the GitHub repo, go to **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **Deploy from a branch**.
5. Branch: `main`, folder: `/ (root)`. Save.
6. GitHub will publish the site at `https://wesdlpteam.github.io/Springboard/`. First
   publish can take a minute or two.

## 2. Create the Vercel project and the Neon database

1. Go to [vercel.com](https://vercel.com) and sign in (or create an account) with the
   GitHub account that owns the repo.
2. **Add New… → Project**, then import `wesdlpteam/Springboard` from the list of GitHub
   repos. Vercel auto-detects the `api/` folder as serverless functions and the rest as a
   static site — no framework preset and no build command are needed.
3. Click **Deploy** to create the project (the first deploy will work but the API calls
   won't yet — that's expected, secrets aren't set up till step 3).
4. In the new Vercel project, go to **Storage → Create Database → Marketplace Database
   Providers → Neon** (Postgres, free tier is enough to start). Follow the prompts to
   create it and connect it to this project. This automatically adds a `DATABASE_URL`
   environment variable to the project — no manual copy-pasting of a connection string.
5. Open the Neon database's **SQL Editor** (either via the Vercel Storage tab's "Open in
   Neon" link, or directly at [console.neon.tech](https://console.neon.tech)), paste in
   the contents of `db/schema.sql` from this repo, and run it. This creates the single
   `events` table analytics is written to.

## 3. Set environment variables

In the Vercel project, go to **Settings → Environment Variables** and add:

| Variable | Value | Notes |
|---|---|---|
| `OPENAI_API_KEY` | your OpenAI secret key | Never commit this. Lives only in Vercel. |
| `OPENAI_MODEL` | e.g. `gpt-5.4` | Optional — `api/generate.js` falls back to `gpt-5.4` if unset. |
| `TEACHER_PASSCODE` | a short shared code, e.g. a word teachers will remember | This is not a real password — one code for the whole school. |
| `ADMIN_PASSWORD` | a separate, stronger password | Gates the `/api/stats` analytics dashboard only. |
| `DATABASE_URL` | (already added automatically in step 2) | Leave as-is. |

Apply to all environments (Production, Preview, Development) unless you have a reason
not to. After adding/changing variables, **redeploy** the project (Vercel's dashboard has
a "Redeploy" button) so the functions pick up the new values.

## 4. Point the frontend at the real API URL

The frontend currently talks to a placeholder API address when not running locally. Find
your Vercel project's URL (Vercel dashboard → project → shown at the top, something like
`https://springboard-xyz123.vercel.app`), then update **both** files:

- `index.html` — search for `SPRINGBOARD-API.vercel.app` (inside the `API_BASE` constant)
  and replace it with your real Vercel domain.
- `stats.html` — same placeholder, same fix, in its own `API_BASE` constant (the two
  files are independent on purpose, so both need the edit).

Commit and push the change:

```bash
git add index.html stats.html
git commit -m "chore: point API_BASE at live Vercel deployment"
git push
```

GitHub Pages will pick up the new `index.html`/`stats.html` automatically within a
minute or two of the push.

## 5. Set a monthly spending cap on the OpenAI key

At [platform.openai.com](https://platform.openai.com) → **Settings → Limits**, set a
monthly spending cap on the project/key Springboard uses. This is the real backstop
against runaway cost if the passcode ever leaks or the app is hit by scripted abuse — the
passcode and CORS origin allowlist are the first line of defence, but a spending cap is
cheap insurance on top.

## 6. Smoke test

Run these from a terminal once the Vercel deployment and env vars are live. Replace
`<VERCEL_URL>` with your real Vercel domain, `<TEACHER_PASSCODE>` and `<ADMIN_PASSWORD>`
with the values you set in step 3.

**OPTIONS preflight — expect `200`, no body:**

```bash
curl -i -X OPTIONS https://<VERCEL_URL>/api/generate \
  -H "Origin: https://wesdlpteam.github.io" \
  -H "Access-Control-Request-Method: POST"
```

**`/api/generate` without a passcode — expect `401`:**

```bash
curl -i -X POST https://<VERCEL_URL>/api/generate \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
```

**`/api/generate` with the correct passcode — expect `200`** (this makes a real, tiny
OpenAI call, so it will show up on the OpenAI usage dashboard):

```bash
curl -i -X POST https://<VERCEL_URL>/api/generate \
  -H "Content-Type: application/json" \
  -H "x-sb-passcode: <TEACHER_PASSCODE>" \
  -d '{"messages":[{"role":"user","content":"Reply with the single word: OK"}]}'
```

**`/api/log` with an unrecognised event name — expect `400`:**

```bash
curl -i -X POST https://<VERCEL_URL>/api/log \
  -H "Content-Type: application/json" \
  -H "x-sb-passcode: <TEACHER_PASSCODE>" \
  -d '{"event":"not-a-real-event"}'
```

**`/api/stats` without the admin password — expect `401`:**

```bash
curl -i -X POST https://<VERCEL_URL>/api/stats
```

**`/api/stats` with the correct admin password — expect `200`** with a JSON body
containing `totals`, `byDay`, `byCurriculum`, `bySubject`, `byRoutine`, `byStimulus`, and
`recent`:

```bash
curl -i -X POST https://<VERCEL_URL>/api/stats \
  -H "x-sb-admin: <ADMIN_PASSWORD>"
```

If every one of those six checks matches its expected status code, the deployment is
live and correctly wired end to end.

## Local development

Working on the frontend or API locally, before anything touches Vercel or GitHub:

```bash
npm install
```

Create a `.env` file in the repo root (never committed — it's already in `.gitignore`)
with the same variables as the table in step 3:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4
TEACHER_PASSCODE=devpasscode
ADMIN_PASSWORD=devadmin
```

(No `DATABASE_URL` locally is fine for most work — you'll only need it for testing
`/api/log` and `/api/stats` against a real database; use `tools/stats-stub.mjs` below to
avoid needing one at all for stats work.)

Then run the API + static site together:

```bash
npx vercel dev
```

`index.html` and `stats.html` both auto-detect `localhost`/`127.0.0.1`/`file:` and point
their `API_BASE` at `http://localhost:3000` automatically, so no code edits are needed
for local work.

To work on the admin stats dashboard (`stats.html`) without a real Neon database:

```bash
node tools/stats-stub.mjs                # realistic fake data, admin password "test123"
STUB_EMPTY=1 node tools/stats-stub.mjs   # "no data yet" empty-state fixture instead
```

then open `http://localhost:3000/stats.html`.

Before pushing any change:

```bash
npm test          # runs the 17 backend unit tests under test/
npm run check:ui  # confirms the inline React/JSX in index.html still compiles
```
