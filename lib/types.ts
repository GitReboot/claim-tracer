/** One factual assertion pulled out of a longer piece of text. */
export interface Claim {
  id: string;
  /** The assertion, rewritten to stand alone without surrounding context. */
  text: string;
  /** Where it appeared in the original, so the UI can highlight it. */
  quote: string;
}

export interface Source {
  title: string;
  uri: string;
}

/**
 * Verdicts are DERIVED from search metadata, never self-reported by the model.
 * Asked to grade its own confidence, a model will happily call an invented fact
 * "sourced" — so the label comes from whether search actually ran and what it
 * actually returned.
 */
export type Verdict = "sourced" | "weak" | "untraceable";

export interface TracedClaim extends Claim {
  verdict: Verdict;
  /** One line on what the search did or didn't turn up. */
  finding: string;
  sources: Source[];
  /** Did Google Search actually execute? False means we cannot judge at all. */
  searched: boolean;
  /** Search queries the model chose — shown so the user can see what was looked for. */
  queries: string[];
}
