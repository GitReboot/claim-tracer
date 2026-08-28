import { Type } from "@google/genai";
import { NextResponse } from "next/server";
import { generate } from "@/lib/gemini";
import { splitPrompt } from "@/lib/prompts";
import type { Claim } from "@/lib/types";

/** Structured output is safe here: no search tool to suppress. */
export const maxDuration = 60;

const schema = {
  type: Type.OBJECT,
  properties: {
    claims: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING, description: "Standalone, searchable restatement" },
          quote: { type: Type.STRING, description: "Verbatim substring from the original" },
        },
        required: ["text", "quote"],
      },
    },
  },
  required: ["claims"],
};

export async function POST(request: Request) {
  try {
    const { text } = await request.json();
    if (typeof text !== "string" || text.trim().length < 20) {
      return NextResponse.json({ error: "Paste a bit more text to work with." }, { status: 400 });
    }

    const { text: raw } = await generate({
      contents: [{ role: "user", parts: [{ text: splitPrompt(text) }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const parsed = JSON.parse(raw || "{}");
    // An empty list is ambiguous: the text genuinely had no claims, or the model
    // returned nothing under load. Those need different messages, so the caller
    // is told which happened rather than always seeing "no claims found".
    const claims: Claim[] = (Array.isArray(parsed.claims) ? parsed.claims : [])
      .slice(0, 8)
      .map((c: { text?: string; quote?: string }, i: number) => ({
        id: String(i),
        text: String(c.text ?? "").trim(),
        quote: String(c.quote ?? "").trim(),
      }))
      .filter((c: Claim) => c.text.length > 0);

    if (claims.length === 0) {
      return NextResponse.json({
        claims: [],
        empty: raw.trim().length === 0 ? "no-response" : "no-claims",
      });
    }
    return NextResponse.json({ claims });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't read that text.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
