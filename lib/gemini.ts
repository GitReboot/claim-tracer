import "server-only";
import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";

/**
 * Gemini with a model fallback chain.
 *
 * Observed 27 Aug 2026: the `gemini-flash-latest` ALIAS returned 503
 * "experiencing high demand" for over an hour while `gemini-3.5-flash` — the
 * concrete model the alias resolves to — answered normally. So the outage was in
 * alias routing, not the model. A demo pinned to the alias would simply have
 * been dead.
 *
 * Ordering: the alias first (it follows Google's current best default), then the
 * concrete model, then lite. Retired IDs are deliberately absent — gemini-2.5-*
 * now 404s, which is why pinning a version is its own trap.
 */
const CHAIN = [
  process.env.GEMINI_MODEL,
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-flash-lite-latest",
].filter((m): m is string => Boolean(m));


/**
 * Remember which model last answered, and try it first next time.
 *
 * The chain is static, but model health is not: on 27-28 Aug 2026 the
 * `gemini-flash-latest` alias returned 503 for over a day while the concrete
 * model behind it was fine. Without this, every request pays the dead model's
 * timeout before failing over — measured at 4.3s per attempt, on every call.
 *
 * Resets naturally when the instance recycles, so a recovered model gets picked
 * up again rather than being blacklisted forever.
 */
let lastGood: string | null = null;

function ordered(): string[] {
  if (!lastGood) return CHAIN;
  return [lastGood, ...CHAIN.filter((m) => m !== lastGood)];
}

const DEFAULT_HTTP = { timeout: 30_000, retryOptions: { attempts: 1 } };

function isTransient(msg: string) {
  return (
    msg.includes("503") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("500") ||
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("504") ||
    msg.includes("DEADLINE_EXCEEDED") ||
    msg.includes("fetch failed") ||
    msg.includes("timed out")
  );
}

/** A 404 means the model ID is gone; skip it immediately rather than retrying. */
function isMissingModel(msg: string) {
  return msg.includes("404") || msg.includes("NOT_FOUND");
}

export function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  return new GoogleGenAI({ apiKey });
}

/**
 * Runs `params` against each model in turn until one answers. Returns the
 * response plus which model actually served it, so the UI can be honest about
 * having fallen back.
 */
export async function generate(
  params: Omit<GenerateContentParameters, "model">,
): Promise<{ text: string; model: string }> {
  const ai = client();
  let lastError: unknown;

  for (const model of ordered()) {
    // Models don't accept identical configs. Verified: gemini-flash-lite-latest
    // rejects `thinkingBudget: 0` with a 400 while accepting the same request
    // without it. So a 400 gets one retry with thinking config stripped before
    // the model is written off.
    for (const dropThinking of [false, true]) {
      const config = { httpOptions: DEFAULT_HTTP, ...(params.config ?? {}) };
      if (dropThinking) {
        if (!("thinkingConfig" in config)) break;
        delete (config as { thinkingConfig?: unknown }).thinkingConfig;
      }

      try {
        const res = await ai.models.generateContent({ ...params, model, config });
        lastGood = model;
      return { text: res.text ?? "", model };
      } catch (error) {
        lastError = error;
        const msg = error instanceof Error ? error.message : "";

        if (msg.includes("400") && !dropThinking && "thinkingConfig" in config) {
          console.warn(`[gemini] ${model} rejected thinkingConfig, retrying without it`);
          continue;
        }
        // Anything that isn't "this model is unavailable" is a real error — a bad
        // prompt or a dead key won't be fixed by trying a different model.
        if (!isTransient(msg) && !isMissingModel(msg)) throw error;
        console.warn(`[gemini] ${model} unavailable, trying next:`, msg.slice(0, 120));
        break;
      }
    }
  }

  throw lastError instanceof Error
    ? new Error(`All Gemini models unavailable. Last error: ${lastError.message}`)
    : new Error("All Gemini models unavailable.");
}

export interface Grounded {
  text: string;
  sources: { title: string; uri: string }[];
  queries: string[];
  /** Whether Google Search ACTUALLY ran — not merely whether the call succeeded. */
  searched: boolean;
  model: string;
}

/**
 * Same fallback chain, with Google Search attached.
 *
 * `searched` is read off groundingMetadata rather than assumed. The model will
 * happily answer from memory with the tool available, and a verdict built on
 * that would be worthless — so the caller needs to know the difference.
 */
export async function generateGrounded(
  params: Omit<GenerateContentParameters, "model">,
): Promise<Grounded> {
  const ai = client();
  let lastError: unknown;

  for (const model of ordered()) {
    try {
      const res = await ai.models.generateContent({
        ...params,
        model,
        config: {
          httpOptions: { timeout: 60_000, retryOptions: { attempts: 1 } },
          tools: [{ googleSearch: {} }],
          ...(params.config ?? {}),
        },
      });
      lastGood = model;
      const gm = res.candidates?.[0]?.groundingMetadata;
      const chunks = (gm?.groundingChunks ?? []).map((c) => ({
        title: c.web?.title ?? "",
        uri: c.web?.uri ?? "",
      }));
      return {
        text: res.text ?? "",
        sources: chunks.filter((c) => c.uri).slice(0, 5),
        queries: gm?.webSearchQueries ?? [],
        searched: Boolean(gm?.webSearchQueries?.length || gm?.groundingChunks?.length),
        model,
      };
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : "";
      if (!isTransient(msg) && !isMissingModel(msg)) throw error;
      console.warn(`[gemini] ${model} unavailable, trying next:`, msg.slice(0, 120));
    }
  }
  throw lastError instanceof Error
    ? new Error(`All Gemini models unavailable. Last error: ${lastError.message}`)
    : new Error("All Gemini models unavailable.");
}

/** Pulls a JSON object out of a response that may be fenced or padded with prose. */
export function parseLoose(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/^```(?:json)?/gm, "").replace(/```$/gm, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}
