// ohm. — UI Prompt Constants
// Drop into your React Native project. Import where needed.
//
// Research basis (kept short):
// - Concrete > abstract language → Construal Level Theory (Trope & Liberman, 2010)
// - Unfinished framing → Ovsiankina effect (drives return behavior)
// - Reciprocal self-disclosure → Aron et al. (1997) fast-friends procedure
// - Processing fluency → under 10 words, lowercase, no punctuation (Alter & Oppenheimer, 2009)
// - Psychological safety at reply moment → Edmondson (1999)
// ─────────────────────────────────────────────
// COMPOSE — placeholder in the "One Big Thought" input
// Rotate randomly, no repeat within 7 days per user
// ─────────────────────────────────────────────
export const COMPOSE_PROMPTS = [
  // tier 1 — low barrier, grounded in a real moment
  "something you almost said at dinner last night",
  "the conversation you replayed walking home",
  "a sentence stuck in your head all week",
  "the text you typed out and then deleted",
  "what you were actually thinking in that meeting",
  "something you noticed today nobody else did",
  "the thing that hit different the second time",
  "a compliment you received that confused you",
  // tier 2 — more pull, still concrete
  "an answer you used to be sure about",
  "the advice you give but can't follow yourself",
  "something you believe that your friends don't",
  "a pattern you keep noticing in people",
  "the part of your work nobody asks about",
  "what you'd build if no one was watching",
  "something you learned by being wrong about someone",
  // tier 3 — vulnerability-adjacent, rotate less often
  "the version of yourself only strangers see",
  "what you're quietly proud of that sounds small",
  "the gap between what you do and what you want",
  "a moment this week where you felt completely yourself",
  "what you'd want someone to understand about your life right now",
] as const;
// ─────────────────────────────────────────────
// COMPOSE SUBTITLE — replaces "This becomes the line on the image."
// Static, not rotating.
// ─────────────────────────────────────────────
export const COMPOSE_SUBTITLE = "the part that doesn't fit in a caption";
// ─────────────────────────────────────────────
// REPLY — placeholder in the reply input box
// Rotate per reply session
// ─────────────────────────────────────────────
export const REPLY_PROMPTS = [
  "what this surfaces in you...",
  "where this meets your own experience...",
  "the honest reaction, before you edit it...",
  "the part that made you stop scrolling...",
  "what this reminds you of...",
  "where you almost agree but not quite...",
  "what you'd add if this were your thought...",
  "the thing this made you remember...",
] as const;
// ─────────────────────────────────────────────
// REPLY SAFETY — persistent subtle text below reply input
// Always visible. Never rotating. This is the single
// highest-leverage line of copy for first-reply conversion.
// ─────────────────────────────────────────────
export const REPLY_SAFETY_TEXT =
  "if they don't respond, this just fades — no one sees it";
// ─────────────────────────────────────────────
// POST-DEPTH — appears once after 8+ message conversations
// Private, only shown to the user, sequential cycle
// ─────────────────────────────────────────────
export const POST_DEPTH_PROMPTS = [
  "what's still moving after that",
  "the part that won't settle",
  "something shifted — what was it",
  "where did your thinking actually change",
  "what do you want to say next that you couldn't say there",
] as const;
// ─────────────────────────────────────────────
// EMPTY STATE — when the feed has no new thoughts
// ─────────────────────────────────────────────
export const EMPTY_STATE_PROMPTS = [
  "nothing new yet — maybe yours starts it",
  "quiet right now — come back with a thought",
  "still here — the next conversation is forming",
] as const;
// ─────────────────────────────────────────────
// WEEKLY NUDGE — opt-in push notification copy
// 01-02 are context-sensitive (only send when true)
// 03-04 are ambient
// ─────────────────────────────────────────────
export const WEEKLY_NUDGE = {
  hasReply: "someone replied to something you left unfinished",
  nearThought: "a thought landed near yours",
  ambient: [
    "your thinking window is open",
    "the feed shifted while you were away",
  ],
} as const;
// ─────────────────────────────────────────────
// ROTATION UTILS
// ─────────────────────────────────────────────
/**
 * Pick a random prompt, avoiding recent ones.
 * recentKeys: array of recently shown prompt strings
 * pool: the prompt array to pick from
 */
export function pickPrompt(
  pool: readonly string[],
  recentKeys: string[] = [],
): string {
  const available = pool.filter((p) => !recentKeys.includes(p));
  const source = available.length > 0 ? available : pool;
  return source[Math.floor(Math.random() * source.length)];
}
/**
 * For compose prompts: weight toward tier 1 for new users.
 * daysActive: how many days since signup
 */
export function pickComposePrompt(
  recentKeys: string[] = [],
  daysActive: number = 0,
): string {
  const tier1 = COMPOSE_PROMPTS.slice(0, 8);
  const tier2 = COMPOSE_PROMPTS.slice(8, 15);
  const tier3 = COMPOSE_PROMPTS.slice(15);
  let pool: readonly string[];
  if (daysActive <= 7) {
    // new user: 70% tier1, 20% tier2, 10% tier3
    const r = Math.random();
    pool = r < 0.7 ? tier1 : r < 0.9 ? tier2 : tier3;
  } else {
    // established: 40% tier1, 40% tier2, 20% tier3
    const r = Math.random();
    pool = r < 0.4 ? tier1 : r < 0.8 ? tier2 : tier3;
  }
  return pickPrompt(pool, recentKeys);
}
