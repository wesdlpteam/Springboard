# Springboard

Springboard turns a teacher-supplied stimulus, a photo, a short video, a PDF, pasted text,
or a web link, into a classroom-ready, editable PowerPoint that launches student thinking.
Each deck is a 4-slide arc, **IGNITE → THINK → LAUNCH → REFLECT**, built around a Project
Zero Thinking Routine, sharpened using Made to Stick principles, and bridged to the
teacher's own curriculum, subject, and year level. Target time from stimulus to finished
deck: about two minutes. No API keys and no sign-in for teachers, just one shared school
passcode that the browser remembers.

Springboard is a fork of [Tech Spotlight Generator](https://github.com/wesdlpteam/Digital-Spotlight),
generalised from a single cyber-safety subject to every subject and curriculum.

## Teacher flow

1. **Add a stimulus** — image(s), a short video, a PDF, pasted text, or a web link (the
   link mode turns the link into a QR code, and a **Fetch text** button pulls in the
   article text).
2. **Set the class** — curriculum (VCE, IB PYP, IB MYP, IB DP, Australian Curriculum, or
   Custom), subject, year level, and optionally a pasted outcome or topic from the
   teacher's own planning document.
3. **Analyse** — the model reads the stimulus and suggests the top 3 Thinking Routines
   for it, each with a one-line reason. Teachers can also browse the full library of 91
   routines, and turn on 2-3 recommended "stickiness" boosters (memorable framing drawn
   from the Made to Stick checklist).
4. **Pick a routine and Generate** — produces an editable 4-slide preview.
5. **Edit and refine** — every field on every slide can be edited by hand, and any single
   slide can be regenerated on its own without touching the rest of the deck. The REFLECT
   slide (a closing routine run at the end of the lesson) can be switched off.
6. **Download** — a real, editable `.pptx` file saved straight to the teacher's computer.
   Nothing is saved back to SharePoint or any school system.

The teacher enters the shared school passcode once; the browser remembers it (see
Privacy, below), and a "Forget" button clears it on demand.

## Privacy

- **Passcode** — stored only in the browser making the request (`localStorage`), never
  sent anywhere except as a header on Springboard's own API calls. It is not a personal
  login; it is one shared code for the whole school, changeable at any time by the admin.
- **Stimulus content** — the text, and any images or video frames from the stimulus, are
  sent to OpenAI to generate the deck, but only via Springboard's own backend (Vercel).
  Teachers' browsers never talk to OpenAI directly, and OpenAI's key never leaves the
  server.
- **Analytics** — every analyse / generate / regenerate / download action logs one
  anonymous usage event. The exact fields recorded are: timestamp, event type, stimulus
  type, curriculum, subject, year level, chosen thinking routine, boosters used, language
  mode, and the lesson topic (the deck's working title). **No teacher name, no student
  name, and no student work is ever collected.**

## Tech overview

- **Frontend**: a single static `index.html` (plus a small `stats.html` for the admin
  analytics dashboard), forked from Tech Spotlight Generator. Plain React run through an
  in-browser Babel compiler, no build step, no bundler. PptxGenJS builds the exported
  PowerPoint, pdf.js reads PDF text, JSZip stamps document properties onto the exported
  file, and qrcode-generator draws the link QR codes. All third-party scripts are loaded
  from a CDN and pinned with Subresource Integrity (SRI) hashes. Hosted for free on
  GitHub Pages.
- **Backend**: a small set of Vercel serverless functions under `api/` act as a proxy so
  the OpenAI key never reaches the browser:
  - `api/generate.js` — sends the stimulus + prompt to OpenAI and returns the result.
  - `api/transcribe.js` — transcribes short audio/video clips via OpenAI.
  - `api/log.js` — records one anonymous analytics event per action.
  - `api/stats.js` — returns aggregated analytics for the admin dashboard only.

  Every call to `generate`/`transcribe`/`log` must carry the teacher passcode in an
  `x-sb-passcode` header; `stats` instead requires an `x-sb-admin` header with the
  separate admin password. Both are checked server-side with a constant-time comparison.
- **Database**: a free-tier Neon Postgres database (`db/schema.sql`) holds a single
  append-only `events` table for analytics. No student or teacher identity is stored.
- **Dev tools** (`tools/`, not shipped to teachers): `compile-check.mjs` checks the inline
  React/JSX in `index.html` compiles cleanly; `stats-stub.mjs` is a tiny local server that
  fakes the `/api/stats` response so the admin dashboard can be built and tested without a
  real database.

For how to actually stand this up (GitHub Pages, Vercel, Neon, environment variables,
smoke tests), see [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Local development

```bash
npm install
npx vercel dev            # serves index.html + api/* locally, reads .env for secrets
```

`index.html` and `stats.html` automatically point at `http://localhost:3000` when opened
from `localhost`/`127.0.0.1`/`file:`, so no code changes are needed for local work.

To iterate on the admin stats page (`stats.html`) without a real Neon database:

```bash
node tools/stats-stub.mjs        # serves a realistic fake /api/stats on :3000
STUB_EMPTY=1 node tools/stats-stub.mjs   # serves the "no data yet" empty state instead
```

Before committing, run:

```bash
npm test          # backend unit tests (17 tests)
npm run check:ui  # confirms the inline React/JSX in index.html still compiles
```

## Roadmap (Phase 2 and beyond)

- **Immersion language mode** — student-facing slide text in a chosen language, with
  teacher guidance in the Notes pane always kept in English.
- **Word / PowerPoint stimulus input** — accept `.docx` and `.pptx` files as a stimulus
  source, alongside images, video, PDF, text, and links.
- **Content-advisory polish** — refine how sensitive-theme stimuli are flagged to
  teachers.
- **Stats page polish** — further improvements to the admin analytics dashboard.
- **Later / not yet scheduled**: Entra ID / Microsoft Graph sign-in, which would replace
  the shared passcodes with real per-teacher accounts.
