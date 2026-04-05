/**
 * Push notification service using Expo Push API.
 * Sends notifications to users via their registered Expo push tokens.
 */

import { eq } from "drizzle-orm";
import { db, pushTokens, users } from "../db";

interface ExpoPushMessage {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function sendExpoPush(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error("[push] Expo API error:", {
        status: response.status,
        statusText: response.statusText,
      });
      return [];
    }

    const result = await response.json();
    const tickets: ExpoPushTicket[] = result.data ?? [];

    // Remove invalid tokens
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (
        ticket?.status === "error" &&
        ticket.details?.error === "DeviceNotRegistered"
      ) {
        const badToken = messages[i]?.to;
        if (badToken) {
          await db
            .delete(pushTokens)
            .where(eq(pushTokens.token, badToken))
            .catch((err) => {
              console.error("[push] Failed to remove invalid token:", {
                token: badToken.slice(0, 20) + "...",
                error: err instanceof Error ? err.message : String(err),
              });
            });
        }
      } else if (ticket?.status === "error") {
        console.warn("[push] Ticket error:", {
          token: messages[i]?.to?.slice(0, 20) + "...",
          error: ticket.details?.error,
          message: ticket.message,
        });
      }
    }

    return tickets;
  } catch (error) {
    console.error("[push] Expo push send failed:", {
      messageCount: messages.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function getTokensForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(eq(pushTokens.userId, userId));
  return rows.map((r) => r.token);
}

async function getUserName(userId: string): Promise<string> {
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.name ?? "someone";
}

/**
 * Notify thought author that they received a new reply.
 */
export async function notifyNewReply(
  thoughtAuthorId: string,
  replierId: string,
  thoughtSentence: string,
  replyPreview: string,
  thoughtId: string
): Promise<void> {
  const tokens = await getTokensForUser(thoughtAuthorId);
  if (tokens.length === 0) return;

  const replierName = await getUserName(replierId);
  const shortThought =
    thoughtSentence.length > 50
      ? thoughtSentence.slice(0, 47) + "..."
      : thoughtSentence;

  await sendExpoPush(
    tokens.map((token) => ({
      to: token,
      title: "new reply",
      body: `${replierName} resonated with "${shortThought}"`,
      data: { type: "reply", thought_id: thoughtId, thought_sentence: thoughtSentence },
      sound: "default",
      priority: "high",
    }))
  );
}

/**
 * Notify thought author that their thought reached 10+ accepted replies
 * and could become a collaborative crossing.
 */
export async function notifyResonanceMilestone(
  thoughtAuthorId: string,
  thoughtSentence: string,
  acceptedCount: number,
  thoughtId: string
): Promise<void> {
  const tokens = await getTokensForUser(thoughtAuthorId);
  if (tokens.length === 0) return;

  const shortThought =
    thoughtSentence.length > 50
      ? thoughtSentence.slice(0, 47) + "..."
      : thoughtSentence;

  await sendExpoPush(
    tokens.map((token) => ({
      to: token,
      title: "your thought is resonating",
      body: `"${shortThought}" has ${acceptedCount} connections`,
      data: {
        type: "resonance_milestone",
        thought_id: thoughtId,
        thought_sentence: thoughtSentence,
        count: acceptedCount,
      },
      sound: "default",
      priority: "default",
    }))
  );
}
