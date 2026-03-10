/**
 * LLM prompts for resonance signature generation (Phase 3).
 * The runtime still stores the primary resonance embedding in the legacy
 * `question_embedding` column for compatibility with the current feed pipeline.
 */

export interface ResonanceTension {
  description: string;
  weight: number;
}

export interface ResonanceSignature {
  tensions: ResonanceTension[];
  domains: string[];
  openness: number;
  abstraction: number;
  resonance_phrases: string[];
}

const DOMAIN_ALLOWLIST = new Set([
  "identity",
  "time",
  "control",
  "belonging",
  "creativity",
  "mortality",
  "knowledge",
  "freedom",
  "purpose",
  "intimacy",
  "change",
  "power",
  "truth",
  "play",
  "loss",
  "growth",
  "wonder",
]);

export const RESONANCE_SIGNATURE_SYSTEM = `You are the resonance engine for ohm., a platform built around intellectual serendipity and meaningful human encounter.

You will receive a thought consisting of:
- sentence: one line of text (the public-facing thought)
- context: up to 600 characters of background (where the thought came from)

Your job is to extract the UNDERLYING STRUCTURE of this thought — not what it's about on the surface, but what it's REALLY about at the level of human experience.

Respond in JSON only. No preamble. No markdown fences.

{
  "tensions": [
    {
      "description": "short phrase describing the core tension",
      "weight": 0.0
    }
  ],
  "domains": ["identity"],
  "openness": 0.0,
  "abstraction": 0.0,
  "resonance_phrases": ["short domain-agnostic phrase"]
}

CRITICAL RULES:
- Never reduce to topic labels.
- The same surface topic from two different people should produce different signatures based on context and framing.
- resonance_phrases must be domain-agnostic and useful for cross-domain matching.
- tensions must capture genuine polarities the thinker is navigating.`;

export function resonanceSignatureUser(sentence: string, context: string): string {
  const payload = {
    sentence,
    context: context.trim(),
  };
  return JSON.stringify(payload, null, 2);
}

function clamp01(value: unknown, fallback = 0.5): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

function normalizeTextArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

export function parseResonanceSignature(text: string): ResonanceSignature {
  try {
    const parsed = JSON.parse(text) as Partial<ResonanceSignature> & {
      tensions?: Array<Partial<ResonanceTension>>;
    };
    const tensions = Array.isArray(parsed.tensions)
      ? parsed.tensions
          .map((tension) => ({
            description:
              typeof tension?.description === "string"
                ? tension.description.trim()
                : "",
            weight: clamp01(tension?.weight, 0.5),
          }))
          .filter((tension) => tension.description.length > 0)
          .slice(0, 3)
      : [];
    const domains = normalizeTextArray(parsed.domains, 3)
      .map((domain) => domain.toLowerCase())
      .filter((domain) => DOMAIN_ALLOWLIST.has(domain));
    const resonancePhrases = normalizeTextArray(parsed.resonance_phrases, 4);

    return {
      tensions:
        tensions.length > 0
          ? tensions
          : [{ description: "unresolved human tension", weight: 0.5 }],
      domains: domains.length > 0 ? domains : ["wonder"],
      openness: clamp01(parsed.openness, 0.5),
      abstraction: clamp01(parsed.abstraction, 0.5),
      resonance_phrases:
        resonancePhrases.length > 0
          ? resonancePhrases
          : ["an unfinished search for meaning"],
    };
  } catch {
    return {
      tensions: [{ description: "unresolved human tension", weight: 0.5 }],
      domains: ["wonder"],
      openness: 0.5,
      abstraction: 0.5,
      resonance_phrases: ["an unfinished search for meaning"],
    };
  }
}
