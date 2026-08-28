"use client";

import { useMemo, useState } from "react";
import { ClaimRow } from "@/components/ClaimRow";
import type { Claim, TracedClaim, Verdict } from "@/lib/types";

const SAMPLE = `Scientists have confirmed that drinking three cups of coffee a day cuts heart disease risk by 47%, according to a study funded by the National Institutes of Health. The FDA quietly approved a new weight loss drug last Tuesday that has already been prescribed to 2 million Americans. Honestly, the whole medical establishment is broken.`;

export default function Home() {
  const [text, setText] = useState("");
  const [claims, setClaims] = useState<TracedClaim[]>([]);
  const [splitting, setSplitting] = useState(false);
  const [tracing, setTracing] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const tally = useMemo(() => {
    const t: Record<Verdict, number> = { sourced: 0, weak: 0, untraceable: 0 };
    for (const c of claims) if (c.verdict) t[c.verdict]++;
    return t;
  }, [claims]);

  async function run() {
    setError(null);
    setClaims([]);
    setSplitting(true);
    try {
      const res = await fetch("/api/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't read that text.");

      const found: Claim[] = data.claims ?? [];
      if (found.length === 0) {
        setError(
          data.empty === "no-response"
            ? "The model didn't answer that time — Gemini is under heavy load today. Try again."
            : "No checkable factual claims in that text — only opinion or prediction.",
        );
        return;
      }

      // Show the claims immediately, then fill verdicts in as each trace lands.
      // Grounded search runs 7-40s, so waiting for all of them would look broken.
      setClaims(found.map((c) => ({ ...c, verdict: "weak", finding: "", sources: [], searched: false, queries: [] })));
      setSplitting(false);
      setTracing(found.length);

      await Promise.all(
        found.map(async (c) => {
          try {
            const r = await fetch("/api/trace", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ claim: c.text }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error ?? "trace failed");
            setClaims((prev) => prev.map((p) => (p.id === c.id ? { ...p, ...d } : p)));
          } catch {
            setClaims((prev) =>
              prev.map((p) =>
                p.id === c.id
                  ? { ...p, verdict: "untraceable", finding: "Couldn't complete the search for this claim." }
                  : p,
              ),
            );
          } finally {
            setTracing((n) => n - 1);
          }
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSplitting(false);
    }
  }

  const busy = splitting || tracing > 0;

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-5 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Claim Tracer</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Paste something that makes factual claims. We split it apart and try to find where
          each one actually came from — not whether it&apos;s true, but whether anything is
          behind it.
        </p>
      </header>

      <section className="mt-6">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Paste a post, article, or forwarded message…"
          className="w-full resize-y rounded-xl border border-neutral-200 bg-[var(--surface)] p-3 text-sm leading-relaxed outline-none focus:border-neutral-900 dark:border-neutral-800 dark:focus:border-white"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void run()}
            disabled={busy || text.trim().length < 20}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            {splitting ? "Reading…" : tracing > 0 ? `Tracing ${tracing}…` : "Trace the claims"}
          </button>
          <button
            onClick={() => setText(SAMPLE)}
            disabled={busy}
            className="text-xs text-neutral-400 underline hover:text-neutral-700 disabled:opacity-40 dark:hover:text-neutral-200"
          >
            use an example
          </button>
        </div>
      </section>

      {error && (
        <p className="mt-4 rounded-lg border border-[#d03b3b]/40 bg-[#d03b3b]/5 px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {claims.length > 0 && (
        <>
          <div className="mt-6 flex flex-wrap gap-4 border-y border-neutral-200 py-3 text-sm dark:border-neutral-800">
            {([
              ["sourced", "#0ca30c", "sourced"],
              ["weak", "#ec835a", "weakly sourced"],
              ["untraceable", "#d03b3b", "untraceable"],
            ] as const).map(([k, tone, label]) => (
              <span key={k} className="flex items-baseline gap-1.5">
                <span className="text-lg font-semibold tabular-nums" style={{ color: tone }}>
                  {tally[k]}
                </span>
                <span className="text-neutral-500">{label}</span>
              </span>
            ))}
            {tracing > 0 && (
              <span className="ml-auto self-center text-xs text-neutral-400">
                still checking {tracing}…
              </span>
            )}
          </div>

          <ul className="mt-4 space-y-3">
            {claims.map((c, i) => (
              <ClaimRow key={c.id} claim={c} index={i} />
            ))}
          </ul>
        </>
      )}

      <footer className="mt-10 border-t border-neutral-200 pt-4 text-[11px] leading-relaxed text-neutral-400 dark:border-neutral-800">
        This traces <em>origin</em>, not truth. &ldquo;Untraceable&rdquo; means search found nothing
        behind a claim — it does not mean the claim is false, and &ldquo;Sourced&rdquo; does not
        mean the source is right. Verdicts come from whether a search actually ran and what it
        returned, never from the model grading its own confidence.
      </footer>
    </main>
  );
}
