"use strict";
/**
 * Bulk insert engagement events (Phase 6). Called from POST /api/engagement/track.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidEventType = isValidEventType;
exports.trackEngagementEvents = trackEngagementEvents;
const db_1 = require("../db");
const types_1 = require("./types");
function isValidEventType(s) {
    return types_1.ENGAGEMENT_EVENT_TYPES.includes(s);
}
function sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return null;
    }
    const sanitizedEntries = [];
    for (const [key, value] of Object.entries(metadata).slice(0, 12)) {
        if (!key.trim())
            continue;
        if (value === null ||
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean") {
            sanitizedEntries.push([key, value]);
            continue;
        }
        if (Array.isArray(value)) {
            const sanitizedArray = value
                .filter((entry) => entry === null ||
                typeof entry === "string" ||
                typeof entry === "number" ||
                typeof entry === "boolean")
                .slice(0, 10);
            sanitizedEntries.push([key, sanitizedArray]);
        }
    }
    return sanitizedEntries.length > 0 ? Object.fromEntries(sanitizedEntries) : null;
}
async function trackEngagementEvents(userId, events) {
    if (events.length === 0)
        return 0;
    const valid = events.filter((e) => isValidEventType(e.event_type) &&
        typeof e.thought_id === "string" &&
        e.thought_id.length > 0 &&
        typeof e.session_id === "string");
    if (valid.length === 0)
        return 0;
    await db_1.db.insert(db_1.engagementEvents).values(valid.map((e) => ({
        userId,
        thoughtId: e.thought_id,
        eventType: e.event_type,
        sessionId: e.session_id,
        metadata: sanitizeMetadata(e.metadata),
    })));
    return valid.length;
}
