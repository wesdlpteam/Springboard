# Springboard — "Add from link" + YouTube slide-embed (media importer)

**Date:** 2026-07-17
**Status:** Approved (design), pending build
**Source of truth:** Ported from Tech Spotlight Generator v1.20.0 (both features already live + verified there).

## Goal

Give Springboard the same two media tools Tech Spotlight has:

1. **Add from link** — paste a public Instagram / X / Facebook / TikTok post URL; the
   post's photo(s)/video(s) land in the reel. Backed by a shared Cobalt instance.
2. **YouTube** — paste a YouTube URL; app pulls oEmbed title + thumbnail (fed to the
   model) and adds a `kind:"youtube"` reel item. Export bakes a **real click-to-play
   YouTube player** into the .pptx (desktop + web PowerPoint). Nothing is downloaded.

Springboard's thinking-routine flow is untouched. This only adds media-input surface.

## Non-goals

- No SharePoint video hosting / autoplay (Tech-Spotlight-only; not in scope).
- No YouTube *download* (Cobalt is bot-blocked on YouTube; embed instead — this is WHY
  YouTube gets its own path).
- No merging of high-res split streams (`local-processing` → friendly skip note).

## Architecture

Two proven, self-contained mechanisms copied from Tech Spotlight. Both slot into
Springboard's existing media reel (`kind:"image"|"video"` → add `"youtube"`).

### Backend (Springboard `api/`)
Copy two files, unchanged except they already import Springboard's own `_lib.js`
(`applyCors`, `requireTeacher`, `rateLimit` — same signatures, so drop-in):

- `api/youtube-meta.js` — POST `{url}` → `{videoId, title, author, thumbnailDataUrl}`.
  Proxies YouTube oEmbed (no CORS) + thumbnail bytes (host-pinned to ytimg/youtube).
  oEmbed status doubles as embeddability check (401/403 = embedding off → 422).
- `api/fetch-post-media.js` — POST `{url}` → `{items:[{type,url,filename}], note?}`.
  Asks Cobalt what media a post holds; returns tunnel URLs only (never bytes → stays
  under Vercel's 4.5 MB cap). Needs env `COBALT_API_URL` (+ optional `COBALT_API_KEY`).

**Auth note:** `requireTeacher` in Springboard checks header `x-sb-passcode`. Client
must send that (not Tech Spotlight's `x-ts-passcode`). In open mode (no
`TEACHER_PASSCODE` env) it passes through.

### Frontend (Springboard `index.html`)
Standalone file (ships to GitHub Pages), so all helpers are inlined. Port from TS:

**Helpers (top-level):**
- `youtubeIdFromLink(raw)` — client twin of server's id parser; keep in sync.
- `addPlayBadge(dataUrl)` — canvas: 16:9 cover-crop + baked play triangle → poster
  jpeg. Empty input → dark placeholder + badge. Used in reel *and* on the slide.
- `YT_MARK_PREFIX = "TSG-YT::"`, `YT_TIMING_TEMPLATE` (verbatim OOXML — **never
  hand-edit**), `injectYouTubeVideos(blob, ytMarks)` — post-build JSZip pass that
  rewrites each marked `<p:pic>` into an external-video ref + click-to-play timing.

**State:** add `postLink`, `importingPost` (reuse existing `mediaNote`, `media`, cap
constant — verify its name in SB during build).

**Handlers:**
- `importFromPostLink(overrideUrl?)` — validates http(s); YouTube link → routes to
  `importYouTubeLink`; else POST `/api/fetch-post-media`, then browser fetches each
  tunnel URL directly and feeds it through SB's single-file ingest path (verify name;
  TS calls it `ingestMediaFile`). Respects the reel cap; friendly partial-failure notes.
- `importYouTubeLink(url)` — POST `/api/youtube-meta`; `thumb` (clean) → fed to model;
  `poster = addPlayBadge(thumb)` → shown; push `{kind:"youtube", youtubeId, watchUrl,
  poster, thumb, title, author, name, aspect:16/9, text:""}`.

**UI:** below the file dropzone — a text input + "Add from link" button
(placeholder "…or paste a post link — Instagram, YouTube, X, Facebook"; Enter submits).
Reel thumbnail: `youtube` shows poster + play tag + a description textarea with a warn
hint ("can't be transcribed — type what happens so the questions match").

**Model prompt:** where SB builds `userContent`, add `kind:"youtube"` → push the
thumb/poster as an `image_url` (mirror TS lines feeding image items), and include the
typed description text the same way video transcript text is included.

**Export builder:** SB uses a `contain()` box + `it.aspect`. Add a `youtube` branch:
`s.addImage({data: it.poster, ...box, altText: YT_MARK_PREFIX + it.youtubeId})` and
`ytMarks.push(it.youtubeId)`. After `pptx.write({outputType:"blob"})` (SB line ~2618),
run `blob = await injectYouTubeVideos(blob, ytMarks)` **before** `stampDocProps`.

**CSP:** Springboard has a strict `Content-Security-Policy` meta (Tech Spotlight has
none). The reel's YouTube preview uses an `<iframe src=youtube.com/embed/…>`, which the
current `default-src 'self'` blocks. Add:
`frame-src https://www.youtube.com https://www.youtube-nocookie.com;`
`connect-src` is already `https:` (permissive) so Cobalt tunnels + ytimg thumb fetch
already work. `img-src` already allows `https: data: blob:`.

## Data flow

```
Add-from-link:  paste URL ─ youtube? ─yes→ importYouTubeLink
                              │no
                              ▼
                POST /api/fetch-post-media ─→ Cobalt ─→ {items[tunnelURL]}
                              ▼
                browser fetch each tunnelURL ─→ Blob ─→ ingest ─→ reel item

YouTube:        paste URL ─→ POST /api/youtube-meta ─→ oEmbed+thumb
                              ▼
                addPlayBadge(thumb) ─→ reel item {kind:youtube}
                              ▼ (export)
                addImage(poster, altText=mark) + ytMarks.push(id)
                              ▼
                pptx.write blob ─→ injectYouTubeVideos ─→ stampDocProps ─→ .pptx
```

## Error handling

- Cobalt not configured (`COBALT_API_URL` unset) → 503 "link-import service isn't set
  up yet"; YouTube path still works.
- YouTube embedding off → 422 friendly message; private/gone → 404; timeout → 504.
- Cobalt error codes → `friendlyError()` map (YouTube-block message points to the
  Desktop "Download Video" app).
- Partial post fetch → "Added what I could" note; reel-cap overflow → cap note.

## Testing / verification (local, before any deploy)

1. Node syntax-check both new `api/*.js` files.
2. Babel-compile the `index.html` inline script (no syntax break) — SB's existing check.
3. Existing `api/_generate.test.mjs` still green.
4. Live path in the debug Chrome window:
   - Paste a YouTube link → reel item appears with play badge; description textarea shows.
   - Generate → model output references the clip.
   - Export → open the .pptx via PowerPoint COM oracle → opens clean; slide carries the
     video ref (verify `injectYouTubeVideos` ran: `videoFile r:link` present in slideXml).
5. "Add from link": if `COBALT_API_URL` set locally, paste a public IG/X post → media
   lands. If not set, confirm the 503 friendly message (YouTube unaffected).

## Deploy gate (standing Springboard rule)

Do **not** auto-push. Build + verify on local `main`, then wait for Nathan's OK. After
approval: also add `COBALT_API_URL` (Render Cobalt instance, same as Tech Spotlight) to
Springboard's Vercel project env, or "Add from link" stays in its 503 state.
