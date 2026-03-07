/**
 * LLM prompts for question extraction and quality scoring (Phase 3).
 */

export const EXTRACT_QUESTION_SYSTEM = `You extract the universal human question beneath specific thoughts. You respond with ONLY 1-2 abstract questions. Nothing else — no preamble, no explanation.`;

export function extractQuestionUser(sentence: string, context: string): string {
  const ctxBlock = context.trim() ? `\nContext: ${context}` : "";
  return `Sentence: ${sentence}${ctxBlock}

What underlying question is this person wrestling with? Express it as 1-2 abstract questions that someone from a COMPLETELY different field or background might also be asking. Do not reference the specific topic, domain, or field.

Examples:
- 'I keep building things nobody asked for' → 'When does creating for yourself become avoidance of creating for others? What makes work meaningful if no one sees it?'
- 'My parents still don't understand why I left home for this' → 'What do we owe the people who shaped us? When does growth require distance from where you started?'
- 'The seminar format makes me perform understanding instead of reaching it' → 'When does the structure meant to help learning become a performance of learning? How do you tell the difference between understanding and appearing to understand?'`;
}

export const QUALITY_SCORE_SYSTEM = `You rate thoughts on two dimensions. Respond in exactly this format and nothing else:
specificity: 0.X
openness: 0.X`;

export function qualityScoreUser(sentence: string, context: string): string {
  const ctxBlock = context.trim() ? `\nContext: ${context}` : "";
  return `Sentence: ${sentence}${ctxBlock}

SPECIFICITY (0.0-1.0): Does this sound like a specific person in a specific moment (1.0), or could anyone have written it (0.0)? Look for concrete details, personal stakes, a particular situation.

OPENNESS (0.0-1.0): Does the context leave something unresolved that a stranger might want to respond to (1.0), or does it fully explain and close the thought (0.0)? The best thoughts have a gap between what the sentence hints at and what the context reveals — a gap that invites someone else's experience in.`;
}

/** Parse "specificity: 0.X" and "openness: 0.X" from LLM output. */
export function parseQualityScores(text: string): { specificity: number; openness: number } {
  const specificityMatch = text.match(/specificity:\s*([0-9.]+)/i);
  const opennessMatch = text.match(/openness:\s*([0-9.]+)/i);
  const specificity = Math.min(1, Math.max(0, parseFloat(specificityMatch?.[1] ?? "0.5") || 0.5));
  const openness = Math.min(1, Math.max(0, parseFloat(opennessMatch?.[1] ?? "0.5") || 0.5));
  return { specificity, openness };
}
