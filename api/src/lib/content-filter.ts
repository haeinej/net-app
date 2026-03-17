/**
 * Server-side content filter for objectionable text.
 * Uses a keyword-based approach with categories matching App Store guidelines.
 * Returns a rejection reason if content is flagged, or null if clean.
 */

// Patterns that indicate clearly objectionable content.
// Each category has terms that would be unambiguous in any context.
const PATTERNS: { category: string; terms: RegExp[] }[] = [
  {
    category: "hate_speech",
    terms: [
      /\bn[i1]gg(?:a|er|uh)s?\b/i,
      /\bk[i1]ke\b/i,
      /\bsp[i1]c(?:k)?s?\b/i,
      /\bch[i1]nk\b/i,
      /\bwet\s*back\b/i,
      /\bgook\b/i,
      /\btr[a@]nn(?:y|ie)s?\b/i,
      /\bf[a@]gg?(?:ot|it)s?\b/i,
    ],
  },
  {
    category: "violence",
    terms: [
      /\b(?:i'?(?:ll|m\s+(?:going|gonna)))\s+(?:kill|murder|shoot|stab)\s+(?:you|them|her|him|everyone)\b/i,
      /\bschool\s+shoot(?:ing|er)\b/i,
      /\bbomb\s+threat\b/i,
    ],
  },
  {
    category: "self_harm",
    terms: [
      /\bkill\s+my\s*self\b/i,
      /\bend\s+(?:my|it\s+all)\s+(?:life|tonight|now)\b/i,
    ],
  },
  {
    category: "sexual_content",
    terms: [
      /\bdick\s*pic\b/i,
      /\bnudes?\s+(?:of|from)\b/i,
      /\bsend\s+nudes\b/i,
    ],
  },
  {
    category: "spam",
    terms: [
      /(?:https?:\/\/){2,}/i, // multiple URLs chained
      /\b(?:buy|click|visit|join)\s+(?:now|here|today)\s*[!.]{2,}/i,
    ],
  },
];

export interface ContentFilterResult {
  flagged: boolean;
  category: string | null;
}

/**
 * Check text against content filter rules.
 * Returns { flagged: true, category } if objectionable, { flagged: false } otherwise.
 */
export function filterContent(text: string): ContentFilterResult {
  if (!text || text.length === 0) {
    return { flagged: false, category: null };
  }

  for (const group of PATTERNS) {
    for (const pattern of group.terms) {
      if (pattern.test(text)) {
        return { flagged: true, category: group.category };
      }
    }
  }

  return { flagged: false, category: null };
}

/**
 * Check text and throw a descriptive error if flagged.
 * Use in route handlers before inserting content.
 */
export function assertContentClean(
  text: string,
  contentType: string = "content"
): void {
  const result = filterContent(text);
  if (result.flagged) {
    const error = new Error(
      `Your ${contentType} was flagged for potentially objectionable content. Please revise and try again.`
    );
    (error as any).statusCode = 400;
    (error as any).category = result.category;
    throw error;
  }
}
