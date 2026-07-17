# Springboard media-from-link import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Tech Spotlight's two media tools into Springboard — "Add from link" (Cobalt post import) and YouTube slide-embed (oEmbed meta + click-to-play player in the .pptx).

**Architecture:** Two proven, self-contained mechanisms copied from Tech Spotlight v1.20.0. Backend = two drop-in Vercel API files. Frontend = new `kind:"youtube"` reel item + a paste-a-link box, threaded through Springboard's existing media reel, AI prompt, and PowerPoint builder. YouTube's live player is injected post-build via JSZip using verbatim OOXML.

**Tech Stack:** Vanilla React (in-browser Babel) in a single `index.html`; PptxGenJS; JSZip; Vercel serverless (`api/*.js`); Cobalt (external) + YouTube oEmbed (external).

## Global Constraints

- Single-file frontend: all client helpers inline in `index.html` (ships to GitHub Pages; cannot import server code).
- Reel cap: `MAX_MEDIA = 10` (index.html:839). Every add path must respect it.
- Client→backend auth header is `x-sb-passcode` (NOT Tech Spotlight's `x-ts-passcode`).
- `YT_TIMING_TEMPLATE` and the `injectYouTubeVideos` rewrite are **copied verbatim** from Tech Spotlight — never hand-edit the OOXML (one dropped tag hard-corrupts the .pptx).
- No auto-push. Build + verify on local `main`; wait for Nathan's OK before deploy.
- Caveman mode for code comments/commits; plain English to the user.

## File Structure

- `api/youtube-meta.js` — CREATE (copy from Tech Spotlight, unchanged). oEmbed + thumbnail proxy.
- `api/fetch-post-media.js` — CREATE (copy from Tech Spotlight, unchanged). Cobalt post→media list.
- `index.html` — MODIFY: CSP, client helpers, state, import handlers, reel/thumbnail UI, AI prompt, PowerPoint builder.

Source paths (Tech Spotlight):
`c:/Users/BennN/Wesley College/College Digital Learning & Practice - Documents/Apps/Tech Spotlight Generator/`

---

### Task 1: Backend endpoints

**Files:**
- Create: `api/youtube-meta.js`
- Create: `api/fetch-post-media.js`

**Interfaces:**
- Produces: `POST /api/youtube-meta {url}` → `{videoId, title, author, thumbnailDataUrl}` (or `{error}` with 4xx/5xx). `POST /api/fetch-post-media {url}` → `{items:[{type,url,filename}], note?}` (or `{error}`).
- Consumes: Springboard's `api/_lib.js` exports `applyCors`, `requireTeacher`, `rateLimit` (already present, same signatures).

- [ ] **Step 1: Copy both files verbatim**

Copy Tech Spotlight's `api/youtube-meta.js` and `api/fetch-post-media.js` into Springboard's `api/`. No edits — they import `./_lib.js`, which resolves to Springboard's own (where `requireTeacher` checks `x-sb-passcode`).

- [ ] **Step 2: Node syntax-check both**

Run: `node --check api/youtube-meta.js && node --check api/fetch-post-media.js`
Expected: no output, exit 0.

- [ ] **Step 3: Confirm _lib exports line up**

Run: `grep -E "export function (applyCors|requireTeacher|rateLimit)" api/_lib.js`
Expected: all three present.

- [ ] **Step 4: Commit**

```bash
git add api/youtube-meta.js api/fetch-post-media.js
git commit -m "feat(api): youtube-meta + fetch-post-media endpoints (ported from Tech Spotlight)"
```

---

### Task 2: Client helpers + CSP

**Files:**
- Modify: `index.html` — CSP meta (line 8); add helpers near the existing `stampDocProps` block (top-level, before `function App()`).

**Interfaces:**
- Produces (top-level, callable everywhere): `youtubeIdFromLink(raw)→string`, `addPlayBadge(dataUrl)→Promise<dataUrl>`, `YT_MARK_PREFIX` (string), `injectYouTubeVideos(blob, ytMarks)→Promise<blob>`.
- Consumes: `JSZip` global (already loaded — `stampDocProps` uses it).

- [ ] **Step 1: Add `frame-src` to the CSP**

In `index.html` line 8, inside the `content="..."` CSP string, add a `frame-src` directive so the reel's YouTube preview iframe is allowed. Insert immediately after `media-src 'self' blob: data:;`:

```
frame-src https://www.youtube.com https://www.youtube-nocookie.com;
```

(`connect-src 'self' https:` and `img-src 'self' data: blob: https:` already cover the Cobalt tunnel + ytimg thumbnail fetches — no change needed there.)

- [ ] **Step 2: Add the four helpers**

Paste these verbatim from Tech Spotlight `index.html` (lines 562–609 for the YT block; 1677–1718 for the parsers) into Springboard `index.html`, immediately **above** `function App() {`. Copy the exact source — reproduced here:

```javascript
// ---- YouTube slide-embed: mark + verbatim click-to-play OOXML (never hand-edit) ----
const YT_MARK_PREFIX = "TSG-YT::";
const YT_TIMING_TEMPLATE = `<p:timing>…VERBATIM…</p:timing>`; // COPY EXACTLY from Tech Spotlight index.html line 566 — do not retype
async function injectYouTubeVideos(blob, ytMarks) {
  // COPY EXACTLY from Tech Spotlight index.html lines 567-609
}
// Client twin of api/youtube-meta.js youtubeVideoId() — keep in sync.
function youtubeIdFromLink(raw) {
  // COPY EXACTLY from Tech Spotlight index.html lines 1679-1692
}
async function addPlayBadge(dataUrl) {
  // COPY EXACTLY from Tech Spotlight index.html lines 1697-1718
}
```

**Do not paraphrase `YT_TIMING_TEMPLATE` or `injectYouTubeVideos`.** Read the exact bytes from Tech Spotlight and paste. The template is one long single-quoted string; the rewrite is a JSZip pass.

- [ ] **Step 3: Verify the copied template is byte-identical**

Run (compares the `YT_TIMING_TEMPLATE` line in both files):
```bash
TS="../Tech Spotlight Generator/index.html"
diff <(grep -n "YT_TIMING_TEMPLATE = " "$TS") <(grep -n "YT_TIMING_TEMPLATE = " index.html) && echo "line differs only by number (OK)"
grep -c "p:cMediaNode" index.html
```
Expected: `grep -c "p:cMediaNode"` returns `1` (template present once).

- [ ] **Step 4: Babel-compile check (whole inline script)**

Run: `node tools/check-babel.mjs 2>/dev/null || echo "no checker — use Task 7 live load"`
(If Springboard has no Babel checker script, this is confirmed at first live load in Task 7. The syntax risk is low: pasted, not authored.)

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: YT embed helpers + play-badge + link parser + frame-src CSP"
```

---

### Task 3: Import state + handlers

**Files:**
- Modify: `index.html` — add state near line 2027; add handlers near `addMediaFiles` (after line 2157).

**Interfaces:**
- Consumes: `MAX_MEDIA`, `media`, `setMedia`, `newId`, `addMediaFiles(fileList)`, `addPlayBadge`, `youtubeIdFromLink`, `passcode`, `setError`, `setMediaNote`, `API_BASE`.
- Produces: state `postLink`/`setPostLink`, `importingPost`/`setImportingPost`; functions `importFromPostLink(overrideUrl?)`, `importYouTubeLink(url)`.

- [ ] **Step 1: Add state**

After `index.html:2027` (`const [mediaNote, setMediaNote] = useState("");`) add:

```javascript
  const [postLink, setPostLink] = useState("");       // paste-a-link box
  const [importingPost, setImportingPost] = useState(false); // link fetch in flight
```

- [ ] **Step 2: Add `importFromPostLink` + `importYouTubeLink`**

After `addMediaFiles` (index.html:2157), insert. Note Springboard reuses `addMediaFiles` (a FileList consumer) for post media — it already handles image/video ingest, frame extraction, transcription, and the cap:

```javascript
  // Paste a post link -> Cobalt lists its media -> fetch each tunnel URL in the
  // browser -> feed through addMediaFiles (same path as the picker). YouTube routes
  // to its own metadata-only handler (Cobalt is bot-blocked on YouTube).
  async function importFromPostLink(overrideUrl) {
    const url = (typeof overrideUrl === "string" ? overrideUrl : postLink).trim();
    setError(""); setMediaNote("");
    if (!/^https?:\/\//i.test(url)) { setError("Paste a full post link starting with http(s):// first."); return; }
    if (MAX_MEDIA - media.length <= 0) { setMediaNote(`That's the limit of ${MAX_MEDIA} items — remove one to add more.`); return; }
    if (youtubeIdFromLink(url)) return importYouTubeLink(url);

    setImportingPost(true);
    try {
      const headers = { "Content-Type": "application/json" };
      if (passcode.trim()) headers["x-sb-passcode"] = passcode.trim();
      const resp = await fetch(API_BASE + "/api/fetch-post-media", { method: "POST", headers, body: JSON.stringify({ url }) });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { setError(data.error || "Couldn't fetch that post. Check the link and try again."); return; }
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) { setMediaNote(data.error || data.note || "No photos or videos found in that post."); return; }

      const files = [];
      for (const it of items) {
        try {
          const mr = await fetch(it.url);                 // Cobalt tunnel is CORS-open
          if (!mr.ok) throw new Error("http " + mr.status);
          const b = await mr.blob();
          const fallback = it.type === "video" ? "video/mp4" : "image/jpeg";
          files.push(new File([b], it.filename || (it.type === "video" ? "clip.mp4" : "photo.jpg"), { type: b.type || fallback }));
        } catch (_) { /* skip the ones the site blocks */ }
      }
      if (!files.length) { setError("Found media but couldn't download it (the site may be blocking it)."); return; }
      await addMediaFiles(files);                          // handles cap + ingest + transcript
      if (data.note) setMediaNote(data.note);
      setPostLink("");
    } catch (_) {
      setError("Couldn't reach the link-import service. Try again in a moment.");
    } finally {
      setImportingPost(false);
    }
  }

  // Paste a YouTube link -> oEmbed title + thumbnail -> reel item kind:"youtube".
  // Nothing is downloaded; the export bakes a click-to-play player onto its slide.
  async function importYouTubeLink(url) {
    setImportingPost(true);
    try {
      const headers = { "Content-Type": "application/json" };
      if (passcode.trim()) headers["x-sb-passcode"] = passcode.trim();
      const resp = await fetch(API_BASE + "/api/youtube-meta", { method: "POST", headers, body: JSON.stringify({ url }) });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { setError(data.error || "Couldn't read that YouTube link. Check it and try again."); return; }
      const thumb = data.thumbnailDataUrl || "";          // clean frame -> fed to the model
      const poster = await addPlayBadge(thumb);            // play-badged -> reel + slide
      setMedia(m => m.length >= MAX_MEDIA ? m : [...m, {
        id: newId(), kind: "youtube", youtubeId: data.videoId,
        watchUrl: "https://www.youtube.com/watch?v=" + data.videoId,
        poster, thumb, title: data.title || "", author: data.author || "",
        name: data.title || "YouTube video", aspect: 16 / 9, text: "",
      }]);
      setMediaNote("YouTube clip added. It can't be transcribed — type what happens in it under its thumbnail so the questions match.");
      setPostLink("");
    } catch (_) {
      setError("Couldn't reach the YouTube lookup. Try again in a moment.");
    } finally {
      setImportingPost(false);
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: paste-a-link + YouTube import handlers (reuse addMediaFiles path)"
```

---

### Task 4: Reel + thumbnail UI

**Files:**
- Modify: `index.html` — reel render (line 1877–1886); thumbnail strip (line 2729–2765).

**Interfaces:**
- Consumes: `postLink`, `setPostLink`, `importingPost`, `importFromPostLink`, `extractingVideo`, `setMediaText`, reel item `it.youtubeId`/`it.poster`/`it.text`.

- [ ] **Step 1: Reel render — add YouTube iframe branch**

Replace `index.html:1877-1879`:

```javascript
        {it.kind === "image"
          ? <img src={it.dataUrl} alt={"Stimulus " + (index + 1) + ": " + it.name} />
          : <video src={it.dataUrl || undefined} poster={it.poster} controls playsInline />}
```

with:

```javascript
        {it.kind === "image"
          ? <img src={it.dataUrl} alt={"Stimulus " + (index + 1) + ": " + it.name} />
          : it.kind === "youtube"
            ? <iframe src={"https://www.youtube.com/embed/" + it.youtubeId} title={it.name}
                style={{ width: "100%", height: "100%", border: 0 }}
                allow="encrypted-media; picture-in-picture" allowFullScreen />
            : <video src={it.dataUrl || undefined} poster={it.poster} controls playsInline />}
```

- [ ] **Step 2: Reel dots a11y — count YouTube as video**

Replace at `index.html:1886`: `(m.kind === "video" ? "video " : "image ")` → `((m.kind === "video" || m.kind === "youtube") ? "video " : "image ")`.

- [ ] **Step 3: Add the paste-a-link box**

After `index.html:2729` (the hidden file `<input>`), before the `{mediaNote && …}` line, insert:

```javascript
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input id="f-postlink" type="text" aria-label="Post link to grab photos and videos from"
                  value={postLink} placeholder="…or paste a post link — Instagram, YouTube, X, Facebook"
                  onChange={e => setPostLink(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); importFromPostLink(); } }} />
                <button type="button" className="btn ghost" style={{ width: "auto", padding: "9px 12px", whiteSpace: "nowrap" }}
                  disabled={importingPost || extractingVideo} onClick={() => importFromPostLink()}>
                  {importingPost ? "Fetching…" : "Add from link"}
                </button>
              </div>
```

- [ ] **Step 4: Thumbnail — play tag + YouTube description textarea**

At `index.html:2737` replace `{it.kind === "video" && <span className="vtag">…}` condition with `{(it.kind === "video" || it.kind === "youtube") && <span className="vtag"><Icon d={I.play} size={14} /></span>}`.

Then, after the video `transcribeState` hint block (ends `index.html:2755`), before the closing `</div>` of `.media-thumb`, add:

```javascript
                      {it.kind === "youtube" && (
                        <React.Fragment>
                          <textarea className="media-text" rows={2} value={it.text}
                            placeholder="What happens in this clip? (it can't be transcribed)"
                            onChange={e => setMediaText(it.id, e.target.value)} />
                          <div className="hint" aria-live="polite">
                            {it.text.trim()
                              ? <span style={{ color: "var(--accent)", fontWeight: 600 }}>Description added ✓</span>
                              : <span>YouTube clips can't be transcribed — type what happens so the questions match.</span>}
                          </div>
                        </React.Fragment>
                      )}
```

- [ ] **Step 5: Update the reel hint copy**

At `index.html:2765`, append to the hint text: ` YouTube links become a live click-to-play clip on the slide (needs internet; works in desktop and web PowerPoint).`

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: reel + thumbnail UI for paste-a-link and YouTube items"
```

---

### Task 5: Feed YouTube to the AI

**Files:**
- Modify: `index.html` — the three identical media `forEach` blocks (lines ~1593, ~1652, ~1716); the `clipText` map (line 1589).

**Interfaces:**
- Consumes: reel item `m.kind`, `m.thumb`, `m.poster`, `m.text`, `m.frames`, `m.dataUrl`.

- [ ] **Step 1: Add YouTube image to all three prompt builders**

Three identical blocks exist. Replace ALL occurrences of:

```javascript
    mediaItems.forEach(m => {
      if (m.kind === "image") userContent.push({ type: "image_url", image_url: { url: m.dataUrl } });
      else (m.frames || []).forEach(fr => userContent.push({ type: "image_url", image_url: { url: fr } }));
    });
```

with:

```javascript
    mediaItems.forEach(m => {
      if (m.kind === "image") userContent.push({ type: "image_url", image_url: { url: m.dataUrl } });
      else if (m.kind === "youtube") { const y = m.thumb || m.poster; if (y) userContent.push({ type: "image_url", image_url: { url: y } }); }
      else (m.frames || []).forEach(fr => userContent.push({ type: "image_url", image_url: { url: fr } }));
    });
```

(Apply to all three — they are byte-identical, so a replace-all is safe.)

- [ ] **Step 2: Include the YouTube description in clip notes**

At `index.html:1589`, replace:

```javascript
      .map((m, i) => (m.kind === "video" && m.text && m.text.trim()) ? `Video at position ${i + 1} — ${m.text.trim().slice(0, 4000)}` : "")
```

with:

```javascript
      .map((m, i) => ((m.kind === "video" || m.kind === "youtube") && m.text && m.text.trim()) ? `${m.kind === "youtube" ? "YouTube clip" : "Video"} at position ${i + 1} — ${m.text.trim().slice(0, 4000)}` : "")
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: feed YouTube thumbnail + teacher description to the model"
```

---

### Task 6: Bake the click-to-play player into the export

**Files:**
- Modify: `index.html` — `buildDeckBlob` (starts line 2374): declare `ytMarks`; `drawStimulus` single-item branch (line 2465-2472); post-write hook (line 2618).

**Interfaces:**
- Consumes: `injectYouTubeVideos`, `YT_MARK_PREFIX`, `stampDocProps`, reel item `it.youtubeId`/`it.poster`, `drawStimulus` `opts.posterOnly`.
- Note: YouTube's live player is only baked when a YouTube clip is the **single** stimulus on the main IGNITE slide (`items.length === 1`, `!opts.posterOnly`). In a multi-item grid, or on the poster-only THINK slide, it stays a static play-badged poster. Document this in the commit.

- [ ] **Step 1: Declare `ytMarks` in the builder**

After `index.html:2404` (`let sNum = 0;`) add:

```javascript
      const ytMarks = []; // youtubeIds whose slide gets a click-to-play player injected post-build
```

- [ ] **Step 2: Draw the YouTube poster + mark it (single-item branch)**

In `drawStimulus`, replace the single-item block `index.html:2465-2472`:

```javascript
          const it = items[0];
          const box = contain(x, y, w, Math.max(0.5, mediaH), it.aspect || (it.kind === "video" ? 16 / 9 : w / mediaH));
          if (it.kind === "image") { s.addImage({ data: it.dataUrl, x: box.x, y: box.y, w: box.w, h: box.h }); drew = true; }
          else { // video: embed small clips (play in desktop PowerPoint); otherwise its poster frame
            const embed = !opts.posterOnly && !!it.dataUrl && it.sizeBytes <= VIDEO_EMBED_MAX_BYTES;
            if (embed) { s.addMedia({ type: "video", data: it.dataUrl, cover: it.poster || undefined, x: box.x, y: box.y, w: box.w, h: box.h }); drew = true; }
            else if (it.poster) { s.addImage({ data: it.poster, x: box.x, y: box.y, w: box.w, h: box.h }); drew = true; }
          }
```

with (adds a `youtube` case that draws the poster and, on the main slide only, marks it for injection):

```javascript
          const it = items[0];
          const box = contain(x, y, w, Math.max(0.5, mediaH), it.aspect || (it.kind === "video" ? 16 / 9 : w / mediaH));
          if (it.kind === "image") { s.addImage({ data: it.dataUrl, x: box.x, y: box.y, w: box.w, h: box.h }); drew = true; }
          else if (it.kind === "youtube") {
            // Poster (play badge baked in). On the primary slide, tag it so the post-build
            // pass swaps it for a real click-to-play YouTube player; on posterOnly slides it
            // stays a static poster (one live player per deck, on the IGNITE slide).
            const mark = !opts.posterOnly;
            s.addImage({ data: it.poster, x: box.x, y: box.y, w: box.w, h: box.h, altText: mark ? (YT_MARK_PREFIX + it.youtubeId) : undefined });
            if (mark) ytMarks.push(it.youtubeId);
            drew = true;
          }
          else { // video: embed small clips (play in desktop PowerPoint); otherwise its poster frame
            const embed = !opts.posterOnly && !!it.dataUrl && it.sizeBytes <= VIDEO_EMBED_MAX_BYTES;
            if (embed) { s.addMedia({ type: "video", data: it.dataUrl, cover: it.poster || undefined, x: box.x, y: box.y, w: box.w, h: box.h }); drew = true; }
            else if (it.poster) { s.addImage({ data: it.poster, x: box.x, y: box.y, w: box.w, h: box.h }); drew = true; }
          }
```

- [ ] **Step 3: Inject the player before stamping props**

At `index.html:2618`, replace:

```javascript
      const blob = await pptx.write({ outputType: "blob" });
      return await stampDocProps(blob, { Title: title, Subject: pptx.subject, Company: "Wesley College" }, tags);
```

with:

```javascript
      let blob = await pptx.write({ outputType: "blob" });
      blob = await injectYouTubeVideos(blob, ytMarks); // no-op when ytMarks is empty
      return await stampDocProps(blob, { Title: title, Subject: pptx.subject, Company: "Wesley College" }, tags);
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: export bakes a click-to-play YouTube player on the IGNITE slide"
```

---

### Task 7: Live verification (evidence before done)

**Files:** none (verification only). Uses the debug Chrome window + PowerPoint COM oracle.

- [ ] **Step 1: App loads without a Babel/JSX error**

Serve `index.html` locally (or open the deployed-off local file) in the debug Chrome window. Confirm the page renders (no blank screen / console SyntaxError). This is the real check for Task 2 Step 4.

- [ ] **Step 2: YouTube add → reel + thumbnail**

Paste a public YouTube link into the "Add from link" box. Expected: a reel item appears with a play-badged poster; the in-app reel shows a YouTube iframe; the thumbnail shows a description textarea + warn hint. `console` shows no CSP violation for `www.youtube.com`.

- [ ] **Step 3: Generate references the clip**

Type a one-line description under the clip, run the generate flow. Expected: model output (ignite question / routine) plausibly reflects the video, confirming the thumbnail + description reached the model.

- [ ] **Step 4: Export opens clean AND carries the player (COM oracle)**

Download the .pptx. Open via PowerPoint COM to confirm it is not corrupt, then confirm the injection ran:

```powershell
# opens + closes; throws if corrupt
$pp = New-Object -ComObject PowerPoint.Application
$d = $pp.Presentations.Open("<path>.pptx", $true, $false, $false)
$d.Close(); $pp.Quit()
```

```bash
# the IGNITE slide XML must carry an external video relationship
unzip -p "<path>.pptx" 'ppt/slides/slide1.xml' | grep -c "videoFile"   # expect >= 1
unzip -p "<path>.pptx" 'ppt/slides/_rels/slide1.xml.rels' | grep -c "youtube.com/embed"  # expect >= 1
```

Expected: opens without repair; both greps ≥ 1.

- [ ] **Step 5: Add-from-link path (Cobalt)**

If `COBALT_API_URL` is set on the local/preview backend: paste a public Instagram or X post link → media lands in the reel. If it is NOT set: confirm the friendly 503 message shows and YouTube still works. (Full Cobalt wiring is a post-approval deploy step.)

- [ ] **Step 6: Report evidence to Nathan and hold**

Summarize what passed with quoted output. Do NOT push. Await Nathan's OK, then (on approval) set `COBALT_API_URL` on Springboard's Vercel and push.

---

## Self-Review

- **Spec coverage:** Backend endpoints (T1) ✓; helpers + CSP (T2) ✓; state/handlers (T3) ✓; reel/thumbnail UI (T4) ✓; AI prompt (T5) ✓; export embed (T6) ✓; verification + deploy gate (T7) ✓. Spec's "verify SB name" notes resolved: cap = `MAX_MEDIA`, ingest = `addMediaFiles`, auth = `x-sb-passcode`, builder = `buildDeckBlob`.
- **Divergence handled:** SB draws media via shared `drawStimulus` (not per-item slides). Resolved by marking only the single-item, non-posterOnly draw → exactly one live player per deck (IGNITE slide). Grid/poster-only YouTube = static badged poster (documented limitation).
- **Placeholder scan:** The only "COPY EXACTLY" markers (T2) are deliberate — `YT_TIMING_TEMPLATE`/`injectYouTubeVideos` must be byte-copied, not retyped, per Global Constraints; exact source line numbers given.
- **Type consistency:** `ytMarks` (array of ids), `YT_MARK_PREFIX` (string), reel item shape `{kind:"youtube", youtubeId, poster, thumb, text, aspect, watchUrl, title, author, name}` used consistently across T3/T4/T5/T6.
