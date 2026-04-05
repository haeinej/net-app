"use strict";
/**
 * Push notification service using Expo Push API.
 * Sends notifications to users via their registered Expo push tokens.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyNewReply = notifyNewReply;
exports.notifyNewMessage = notifyNewMessage;
exports.notifyResonanceMilestone = notifyResonanceMilestone;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
async function sendExpoPush(messages) {
    if (messages.length === 0)
        return [];
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
        const tickets = result.data ?? [];
        // Remove invalid tokens
        for (let i = 0; i < tickets.length; i++) {
            const ticket = tickets[i];
            if (ticket?.status === "error" &&
                ticket.details?.error === "DeviceNotRegistered") {
                const badToken = messages[i]?.to;
                if (badToken) {
                    await db_1.db
                        .delete(db_1.pushTokens)
                        .where((0, drizzle_orm_1.eq)(db_1.pushTokens.token, badToken))
                        .catch((err) => {
                        console.error("[push] Failed to remove invalid token:", {
                            token: badToken.slice(0, 20) + "...",
                            error: err instanceof Error ? err.message : String(err),
                        });
                    });
                }
            }
            else if (ticket?.status === "error") {
                console.warn("[push] Ticket error:", {
                    token: messages[i]?.to?.slice(0, 20) + "...",
                    error: ticket.details?.error,
                    message: ticket.message,
                });
            }
        }
        return tickets;
    }
    catch (error) {
        console.error("[push] Expo push send failed:", {
            messageCount: messages.length,
            error: error instanceof Error ? error.message : String(error),
        });
        return [];
    }
}
async function getTokensForUser(userId) {
    const rows = await db_1.db
        .select({ token: db_1.pushTokens.token })
        .from(db_1.pushTokens)
        .where((0, drizzle_orm_1.eq)(db_1.pushTokens.userId, userId));
    return rows.map((r) => r.token);
}
async function getUserName(userId) {
    const [user] = await db_1.db
        .select({ name: db_1.users.name })
        .from(db_1.users)
        .where((0, drizzle_orm_1.eq)(db_1.users.id, userId))
        .limit(1);
    return user?.name ?? "someone";
}
/**
 * Notify thought author that they received a new reply.
 */
async function notifyNewReply(thoughtAuthorId, replierId, thoughtSentence, replyPreview, thoughtId) {
    const tokens = await getTokensForUser(thoughtAuthorId);
    if (tokens.length === 0)
        return;
    const replierName = await getUserName(replierId);
    const shortThought = thoughtSentence.length > 50
        ? thoughtSentence.slice(0, 47) + "..."
        : thoughtSentence;
    await sendExpoPush(tokens.map((token) => ({
        to: token,
        title: "new reply",
        body: `${replierName} resonated with "${shortThought}"`,
        data: { type: "reply", thought_id: thoughtId, thought_sentence: thoughtSentence },
        sound: "default",
        priority: "high",
    })));
}
/**
 * Notify conversation participant of a new message.
 */
async function notifyNewMessage(recipientId, senderId, messagePreview, conversationId) {
    const tokens = await getTokensForUser(recipientId);
    if (tokens.length === 0)
        return;
    const senderName = await getUserName(senderId);
    const shortMsg = messagePreview.length > 80
        ? messagePreview.slice(0, 77) + "..."
        : messagePreview;
    await sendExpoPush(tokens.map((token) => ({
        to: token,
        title: senderName,
        body: shortMsg,
        data: { type: "message", conversation_id: conversationId, sender_id: senderId, sender_name: senderName },
        sound: "default",
        priority: "high",
    })));
}
/**
 * Notify thought author that their thought reached 10+ accepted replies
 * and could become a collaborative crossing.
 */
async function notifyResonanceMilestone(thoughtAuthorId, thoughtSentence, acceptedCount, thoughtId) {
    const tokens = await getTokensForUser(thoughtAuthorId);
    if (tokens.length === 0)
        return;
    const shortThought = thoughtSentence.length > 50
        ? thoughtSentence.slice(0, 47) + "..."
        : thoughtSentence;
    await sendExpoPush(tokens.map((token) => ({
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
    })));
}
