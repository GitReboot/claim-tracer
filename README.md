# Claim Tracer

**Where did this actually come from?**

A viral post makes six factual claims and cites nothing. Claim Tracer splits the
text into atomic claims, runs a grounded web search for the origin of each one,
and labels it **Sourced**, **Weakly sourced**, or **Untraceable** — with the search
queries and the sources it found shown alongside. It traces *origin*, not truth:
"Untraceable" means nothing was found behind a claim, not that the claim is false.

Built for the DevFest DC 2026 Build-a-thon (concept 1.1).

**Live:** https://claim-tracer-887362198556.us-east1.run.app

## Team

**Waveparticle**
- Suchir Vangaveeti — vangaveeti.v@northeastern.edu

## Run it

```bash
cp .env.local.example .env.local   # add GEMINI_API_KEY
npm install
npm run dev                        # http://localhost:3000
```

You need a Gemini API key from https://aistudio.google.com/apikey. **Billing must
be enabled** — Search grounding's free 1,500/day allowance only exists on paid
tiers; on a free key grounded calls return 429 immediately.

Deploy to Cloud Run:

```bash
./deploy.sh                        # prints the public URL
```

## How it works

Two calls, and they have to be separate.

**`/api/split`** — structured output, no tools. Breaks the text into claims that can
stand alone, resolving pronouns so each is searchable on its own. Opinions,
predictions and value judgements are excluded.

**`/api/trace`** — one grounded Google Search per claim, run in parallel. Returns
prose describing what search found, plus the queries it chose and the sources.

They are separate because **asking Gemini for JSON silently disables its search
tool.** Verified directly: the same question asked in prose returned 8 grounding
chunks; with `return ONLY JSON` it performed no search at all and returned empty
grounding metadata. So the research half must be prose.

### The verdict is derived, not self-reported

A model asked "is this well sourced?" will vouch for something it invented. So the
label comes from two things it can't fake:

1. **Did search actually run?** Read off `groundingMetadata`, not assumed from the
   call succeeding. No search or no sources → `untraceable`, regardless of how
   confident the prose sounds.
2. **A discrete marker** the model must emit on its own line: `ORIGIN: PRIMARY`,
   `ORIGIN: SECONDARY`, or `ORIGIN: NONE`.

An earlier version pattern-matched the prose instead. It scored *"can be directly
traced to the 1889 World's Fair records"* as merely weak, because "traced" wasn't in
the keyword list. Regex over natural language is guesswork; a marker is not.

### Model fallback chain

`lib/gemini.ts` walks `gemini-flash-latest` → `gemini-3.5-flash` →
`gemini-flash-lite-latest`. On 27 Aug 2026 the *alias* returned 503 for over twelve
hours while the concrete model behind it answered normally — the outage was in alias
routing. Anything pinned to a single model ID would have been dead. It also handles
404s from retired IDs and a 400 from `flash-lite` rejecting `thinkingBudget: 0`.

## What we cut, and why

- **No accounts, no database.** Paste, trace, read. Judges won't sign up for a demo,
  and nothing here needs to persist.
- **No truth judgement.** Deciding whether a claim is *correct* is a different and
  much harder problem. Tracing whether anything is behind it is achievable and
  useful on its own — and the honest version of what a search can tell you.
- **Claims capped at 8.** Each one is a separate grounded search; more than that and
  the demo stops being watchable.

## Known limitations

- **Tracing takes 20–60s per claim.** Grounded search is genuinely slow. Claims are
  traced in parallel and verdicts stream in as they land, so the page fills
  progressively rather than blocking.
- **"Untraceable" is not "false."** It means a search didn't find an origin. Obscure
  but true claims can land here.
- **"Sourced" does not mean the source is right.** It means the claim can be traced
  to an original record, not that the record is correct.
- Search coverage is English-language and web-indexed; paywalled and offline sources
  are invisible to it.
