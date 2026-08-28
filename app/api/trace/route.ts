import { NextResponse } from "next/server";
import { generateGrounded } from "@/lib/gemini";
import { tracePrompt } from "@/lib/prompts";
import type { Source, Verdict } from "@/lib/types";

/** One grounded search. Measured 7-36s, hence Cloud Run rather than a 10s host. */
export const maxDuration = 120;

/**
 * The verdict comes from a marker the model states explicitly, checked against
 * the search metadata — never from asking it to grade its own confidence.
 *
 * An earlier version pattern-matched the prose. It read "can be directly traced
 * to the 1889 World's Fair records" as merely weak, because "traced" wasn't in
 * the keyword list. Regex over natural language is guesswork; a discrete marker
 * is not. The marker sits in prose rather than a JSON schema because a schema
 * silently disables the search tool.
 *
 * Metadata still overrides the marker: no search, or no sources, cannot be
 * "sourced" however confidently the model asserts it.
 */
function classify(searched: boolean, sources: Source[], finding: string): Verdict {
  if (!searched || sources.length === 0) return "untraceable";

  const marker = /ORIGIN:\s*\**\s*(PRIMARY|SECONDARY|NONE)/i.exec(finding)?.[1]?.toUpperCase();
  if (marker === "NONE") return "untraceable";
  if (marker === "PRIMARY") return "sourced";
  if (marker === "SECONDARY") return "weak";

  // Format not followed — don't over-claim on the model's behalf.
  return "weak";
}

/** The marker is plumbing; strip it before the finding reaches the screen. */
function stripMarker(text: string): string {
  return text
    .replace(/\**\s*ORIGIN:\s*\**\s*(PRIMARY|SECONDARY|NONE)\**\s*$/gim, "")
    .trim();
}

export async function POST(request: Request) {
  try {
    const { claim } = await request.json();
    if (typeof claim !== "string" || !claim.trim()) {
      return NextResponse.json({ error: "No claim supplied." }, { status: 400 });
    }

    const res = await generateGrounded({
      contents: [{ role: "user", parts: [{ text: tracePrompt(claim) }] }],
    });

    const finding = res.text.replace(/\s*\[[\d.,\s]+\]/g, "").replace(/\s{2,}/g, " ").trim();

    return NextResponse.json({
      verdict: classify(res.searched, res.sources, finding),
      finding: stripMarker(finding),
      sources: res.sources,
      searched: res.searched,
      queries: res.queries,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
