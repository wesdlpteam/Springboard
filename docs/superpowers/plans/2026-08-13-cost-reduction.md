# 2026-08-13 — Lowering the per-lesson API cost

Nathan asked to lower running costs. This is the measured breakdown, the levers ranked
by (saving ÷ risk), and what is being implemented now versus what needs his decision.

## Where the money actually goes

Per finished lesson today, article stimulus, `gpt-5.6-terra` main + `gpt-5.6-luna` helpers,
at OpenAI's 30 July 2026 prices (terra $2/M in, $12/M out; luna $0.20/M in, $1.20/M out):

| Component | Tokens | Cost (USD) | Share |
|---|---|---|---|
| generate — INPUT (sys prompt + limits + article + guide) | ~14,000 | $0.028 | 40% |
| generate — OUTPUT, of which ~2,000 is reasoning | ~3,000 | $0.036 | 51% |
| analyse + jury + reveal check (all Luna) | ~11,000 | $0.005 | 7% |
| **Typical total** | | **~$0.069** | |

Plus, on most lessons, one scoped regenerate ("New options"): ~$0.048 more.

Two facts drive everything below:
1. **Output costs 6x what input costs**, and ~two thirds of our output is reasoning
   tokens. `GEN_REASONING` (index.html ~3800) is the single largest cost lever in the
   product.
2. **A scoped regenerate ships the entire prompt**: `limits` (every field's rules, all
   nine of them) is built unconditionally at index.html ~3001-3074 and injected via
   `instruction` into `userContent` for every call, including `scope !== "all"`. So
   regenerating REFLECT still pays for the full ignite.question, think.routine and
   think.reveal rule blocks, plus the whole 12,000-char article, plus the whole current
   deck JSON.

## Lever A — scoped regenerate sends only what it needs (IMPLEMENT NOW)

**Saving:** ~$0.012-0.016 per regenerate click, roughly 25-30% of each click.
**Quality risk:** none, if bounded as below. The model is already told to return only
the scoped keys; it does not need the other fields' word limits to do that.

Change, in `generateSpringboard` (index.html):
- Build `limits` as a keyed map rather than a flat array, then join only the entries the
  current `scope` needs:
  - `scope === "all"` → every entry (today's exact string, byte-identical).
  - `scope === "ignite"` → ignite.question only.
  - `scope === "think"` → think.routine + think.reveal + think.summary.
  - `scope === "launch"` → launch.* only.
  - `scope === "reflect"` → reflect.revisit + reflect.metacognition.
  - `scope === "next"` → next only.
  - The shared preamble ("Respect every word limit", "Return STRICT JSON only") stays on
    every call unchanged.
- For `scope !== "all"`, trim the article passed to the model: `sourceText.slice(0, 6000)`
  instead of 12,000. The current deck (already in the system message) carries the lesson
  context; the article is there for grounding, and 6,000 chars covers the opening of any
  realistic classroom article.
- Do NOT change anything on the `scope === "all"` path. A full generate must produce a
  byte-identical prompt to today's.

**Acceptance:** a unit-style assertion (audit:static) that (a) the `scope === "all"`
instruction string is unchanged from the current build, and (b) each scoped instruction
contains its own field's rules and none of the others'.

## Lever B — restructure the prompt so OpenAI's automatic cache applies (DECISION)

**Saving:** ~$0.010-0.011 per lesson (15-17%), applied automatically, forever.
**Risk:** real, needs a live audit before trusting.

OpenAI caches the longest identical *prefix* of a prompt (≥1024 tokens) and discounts
cached reads heavily. Our system prompt breaks its own prefix almost immediately:
line 2 is `Audience tone: ${tone}. ${bandBrief}`, and the routine name lands a line later.
So essentially nothing is cacheable today even though 60-70% of the prompt is identical
on every single lesson.

The fix is to reorder, not rewrite: one invariant block first (the "what is actually
there" rules, the naming rules, the notes-section format, the JSON schema line), then a
clearly separated context block carrying tone/band/routine/curriculum/focus/playbook.

**Why this needs Nathan's sign-off:** the codebase deliberately relies on ordering. The
playbook is appended late precisely because "the model follows the most specific, most
recent instruction" (comment at ~2970), and the reading-age ceiling is attached per field
for the same reason. Moving blocks earlier can weaken exactly those rules. Before
shipping, run `npm run audit:live` (30 lessons, ~$7, must run in Nathan's own terminal)
and compare against the current baseline in `.audit-live/out`.

## Lever C — `GEN_REASONING` medium → low (NATHAN'S CALL)

**Saving:** ~$0.010-0.012 per lesson (15-18%), and lessons finish noticeably faster.
**Trade:** quality. This is not a free win.

It was "low" until 2026-08-04 (0809bad) when it went to "medium" to buy quality. Two
guards have shipped SINCE that decision (a92d98c, 2026-08-11): the jury commitment test
that fails soft "Do you think…" openers, and the one-shot summary-count retry. Those
catch the specific failures medium was protecting against, so retesting low is more
attractive now than when the decision was made. It is still a quality decision, not a
cost one, and it needs the same 30-lesson live audit to judge.

## Lever D — make Lever C testable for under $1 instead of $7 (IMPLEMENT NOW)

Nathan approved A and B, and asked for a way to judge C without a 30-lesson audit.
The control arm already exists: `.audit-live/out` holds 30 lessons generated on
2026-08-11 with the current prompts, Terra, and `GEN_REASONING = "medium"`. We only need
to pay for the new arm, on a subset.

Three small pieces of scaffolding, none of which changes default behaviour:

1. **`OUT` env override in `tools/audit-live.mjs`.** `OUT` is currently hard-coded to
   `.audit-live/out` (line 23), so any new run overwrites the baseline. Accept
   `process.env.OUT` as a directory NAME under `.audit-live/` (default `out`, unchanged),
   so a run can land in `out-b-medium`, `out-b-low`, etc. Reject anything containing a
   path separator or `..`.
2. **Reasoning override hook.** `GEN_REASONING` (index.html ~3800) is a bare const, so
   testing it means hand-editing production code each time. Change it to read an optional
   global, defaulting to exactly today's value:
   `const GEN_REASONING = (typeof window !== "undefined" && window.__sbReasoning) || "medium";`
   and have `audit-live.mjs` set `window.__sbReasoning` from `process.env.SB_REASONING`
   when that variable is present. With the variable unset, production behaviour is
   byte-identical to today.
3. **Fix the known false positive in `tools/audit-live-report.mjs`.** It still fails
   canonical routine steps ("Choose one perspective to explore.", "Why is it that way?")
   as sentence fragments; the checker predates the canonical-wording pivot. On the last
   run that produced 10 bogus "pedagogy FAIL" lines. A comparison is worthless if a tenth
   of its failures are noise, so this must be fixed before the test is run. Exempt steps
   that match a routine's canonical `steps` wording from the fragment check.

### The test Nathan then runs (his own terminal, per the sandbox constraint)

Eight configs spanning the bands and stimulus types, for example
`F-english-img,4-hass-img,7-geog-img,8-history-img,10-english-art,11-biology-img,3-science-vid,12-psych-art`.

```
# Arm 1 (control): already on disk, free — .audit-live/out (medium, pre-B prompt)
# Arm 2: new prompt order, medium  → isolates Lever B
ONLY=<the eight> OUT=out-b-medium FORCE=1 npm run audit:live:rerun
# Arm 3: new prompt order, low     → isolates Lever C
ONLY=<the eight> OUT=out-b-low SB_REASONING=low FORCE=1 npm run audit:live:rerun
```

Cost: 8 lessons at ~$0.06 plus 8 at ~$0.05, about **$0.90 total**, versus $7 for a full
re-baseline. Two arms rather than one is what keeps the two changes separable: if quality
moves, you can tell whether the prompt reorder or the reasoning drop caused it.

Judge on what the report already measures (word limits, reveal present, 5-sentence
summary, canonical step wording, band pitch, invented AC codes), plus reading three
lessons side by side in `.audit-live/lessons.html`.

## Not recommended

- **Compressing the "Measured failure" anecdotes** in the prompt. They read as bloat but
  each one exists because a real lesson went wrong in that exact way. Saving is small
  (~$0.004/lesson) and the regression risk is high.
- **Moving the main writer to Luna.** ~85% cheaper and a large quality drop. The two-tier
  split already put every helper call on Luna; the main lesson is the one thing worth
  paying for.
- **`detail: "low"` on stimulus images.** Would cut image tokens sharply, but the entire
  product depends on the model seeing the picture accurately, and the prompt carries
  several rules about misreading what is in the image. Not worth it.

## MEASURED after implementation (2026-08-13) — one estimate was wrong

Measured against the shipped code, not estimated:

- **Lever A is bigger than forecast.** A full build sends 17,324 characters of field rules. A
  scoped regenerate now sends: launch 697, next 931, reflect 3,177, ignite 3,410, think
  6,106. So a "New options" click skips 11,200 to 16,600 characters (~2,800 to ~4,150
  tokens), plus 6,000 characters of article (~1,500 tokens). That is roughly 30-40% off
  the input of every redraft click.
- **Lever B is SMALLER than forecast, and my earlier 15-17% claim was wrong.** Measured
  worst case (a Prep lesson vs a Year 12 lesson) the shared invariant prefix is 6,836
  characters, about **1,709 tokens**, not the 6,000+ I assumed. At $2/M with a ~90% cache
  discount that is about **$0.003 per lesson, roughly 4-5% of the generate call**, and only
  when the cache is warm. It is still worth having (it costs nothing at runtime and the
  saving compounds), but it is not a headline number. The cap exists because the field
  rules live in the USER message and start interpolating early; the cached prefix stops at
  the first per-lesson value. NOTE: consecutive lessons for the SAME class and routine
  share far more than this worst case, so real-world hit value sits somewhere above 1,709
  tokens. Do not quote a figure for that without measuring it.
- **Lever D3 was worse than reported.** 45 canonical routine steps across the 91-routine
  catalogue are under six words ("What do you see?", "Propose possible explanations.",
  "Look quietly for 30 seconds."), so the old fragment check was mis-failing far more than
  the 10 lines seen on one run. Now exempted by matching against the catalogue itself.

**Revised per-lesson figure.** Generate ~$0.061 (was $0.064), redraft click ~$0.038 (was
$0.048). A finished lesson with one redraft goes from about $0.112 to about $0.099 USD,
which is **15.8c to 14.0c AUD**. The proposal's "about 14 cents" line therefore still
holds, and now holds after a redraft rather than before one.

## Honest framing for the proposal

At the proposal's "College-wide, steady" level (12,000 lessons/year), Lever A alone takes
the annual API cost from about $1,680 to roughly $1,400 AUD. A and B together land near
$1,150. Adding C would reach roughly $950. For context, the Vercel line in the same
budget is $410, so beyond this point the hosting and the adoption rate matter more than
the model spend.

## Scope for this change

- File in scope: `index.html` only, plus assertions in `tools/audit-static.cjs`.
- Lever A only. Do not implement B or C without a separate instruction.
- `npm test`, `npm run check:ui`, `npm run audit:static` must pass.
- Bump `APP_VERSION`.
- No `api/` change, so no Vercel deploy needed.
