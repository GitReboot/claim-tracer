/**
 * Splitting and tracing must be separate calls.
 *
 * Asking Gemini for JSON silently disables its search tool — verified while
 * building an earlier project: the same question in prose returned 8 grounding
 * chunks, with "return ONLY JSON" it performed no search at all. So splitting
 * uses structured output with no tools, and tracing uses prose with search.
 */

export function splitPrompt(text: string) {
  return `Break this text into its distinct factual claims.

TEXT:
"""
${text.slice(0, 6000)}
"""

A factual claim is a statement that could in principle be checked against a
source: a number, an event, an attribution, a causal assertion. Opinions,
predictions, rhetorical questions and value judgements are NOT claims.

For each one:
- "text": rewrite it to stand alone, resolving pronouns and implied subjects, so
  it can be searched without the surrounding paragraph.
- "quote": the exact substring from the original text, copied verbatim.

Return at most 8, ordered as they appear. If the text makes no checkable factual
claims at all, return an empty list.`;
}

export function tracePrompt(claim: string) {
  return `Search the web to find the ORIGIN of this claim.

CLAIM: "${claim}"

Report, in prose:
- Whether a primary source exists — the study, filing, dataset, official
  statement or first-hand report the claim ultimately rests on.
- If you only find secondary coverage (news articles citing each other, posts
  repeating it), say so explicitly and name what they cite.
- If you find nothing that supports it, say that plainly.
- If you find that it is contradicted or has been corrected, say that.

Do not evaluate whether the claim is true or false. The question is narrower:
can its origin be traced? Report only what search results actually showed.

Finish with exactly one of these markers on its own final line:

ORIGIN: PRIMARY     - you identified the specific study, filing, dataset, official
                      record or first-hand account the claim rests on
ORIGIN: SECONDARY   - real coverage exists but only repeats or cites other
                      coverage; you could not reach an original
ORIGIN: NONE        - search surfaced nothing supporting it, or it is contradicted

The marker is the machine-readable part. It must match your prose.`;
}
