"use client";

import type { TracedClaim, Verdict } from "@/lib/types";

const VERDICT: Record<Verdict, { label: string; tone: string; tint: string; blurb: string }> = {
  sourced: {
    label: "Sourced",
    tone: "#0ca30c",
    tint: "rgb(12 163 12 / 0.07)",
    blurb: "Traced to an original record",
  },
  weak: {
    label: "Weakly sourced",
    tone: "#ec835a",
    tint: "rgb(236 131 90 / 0.09)",
    blurb: "Coverage exists, but only repeats other coverage",
  },
  untraceable: {
    label: "Untraceable",
    tone: "#d03b3b",
    tint: "rgb(208 59 59 / 0.07)",
    blurb: "Search surfaced nothing behind it",
  },
};

export function ClaimRow({ claim, index }: { claim: TracedClaim; index: number }) {
  const v = VERDICT[claim.verdict];

  return (
    <li
      className="rounded-xl border p-4"
      style={{ borderColor: `${v.tone}55`, background: v.tint }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-relaxed">
          <span className="mr-2 font-mono text-xs text-neutral-400">{index + 1}</span>
          {claim.text}
        </p>
        <span
          className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium"
          style={{ borderColor: v.tone, color: v.tone }}
        >
          {v.label}
        </span>
      </div>

      <p className="mt-1 pl-6 text-[11px] text-neutral-400">{v.blurb}</p>

      {claim.finding && (
        <p className="mt-3 border-l-2 pl-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300"
           style={{ borderColor: `${v.tone}66` }}>
          {claim.finding}
        </p>
      )}

      {/* What was actually searched for — the user can judge whether the search
          was a fair test of the claim. */}
      {claim.queries.length > 0 && (
        <p className="mt-2 text-[10px] text-neutral-400">
          searched: {claim.queries.slice(0, 3).map((q) => `“${q}”`).join(" · ")}
        </p>
      )}

      {claim.sources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {claim.sources.map((s, i) => (
            <a
              key={i}
              href={s.uri}
              target="_blank"
              rel="noopener noreferrer"
              className="max-w-[180px] truncate rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] text-neutral-500 hover:border-neutral-500 dark:border-neutral-700"
            >
              {s.title || "source"}
            </a>
          ))}
        </div>
      )}

      {!claim.searched && (
        <p className="mt-2 text-[11px] text-neutral-500">
          Web search didn&apos;t run for this one, so it hasn&apos;t been checked — not
          the same as having been checked and failed.
        </p>
      )}
    </li>
  );
}
