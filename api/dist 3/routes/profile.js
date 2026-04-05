"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileRoutes = profileRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const client_1 = __importDefault(require("../db/client"));
const auth_1 = require("../lib/auth");
const password_1 = require("../lib/password");
const INTERESTS_MAX = 3;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPTIONAL_DELETE_TABLES = [
    "email_verification_codes",
    "reports",
    "blocks",
    "crossing_replies",
    "feed_serves",
    "user_feed_profiles",
    "feed_snapshots",
    "push_tokens",
    "shift_drafts",
    "shifts",
];
const DELETE_ROOT_TABLES = [
    "users",
    "thoughts",
    "replies",
    "conversations",
    "crossings",
    "crossing_drafts",
];
const MANUALLY_HANDLED_DELETE_TABLES = new Set([
    ...OPTIONAL_DELETE_TABLES,
    ...DELETE_ROOT_TABLES,
    "messages",
    "user_recommendation_weights",
    "image_generations",
    "engagement_events",
    "failed_processing_jobs",
]);
const DELETE_ROOT_ID_SELECTS = {
    users: "select $1::uuid as id",
    thoughts: `
    select id
    from public.thoughts
    where user_id = $1::uuid
  `,
    replies: `
    select id
    from public.replies
    where replier_id = $1::uuid
       or thought_id in (
         select id
         from public.thoughts
         where user_id = $1::uuid
       )
  `,
    conversations: `
    select id
    from public.conversations
    where participant_a = $1::uuid
       or participant_b = $1::uuid
       or thought_id in (
         select id
         from public.thoughts
         where user_id = $1::uuid
       )
       or reply_id in (
         select id
         from public.replies
         where replier_id = $1::uuid
            or thought_id in (
              select id
              from public.thoughts
              where user_id = $1::uuid
            )
       )
  `,
    crossing_drafts: `
    select id
    from public.crossing_drafts
    where initiator_id = $1::uuid
       or auto_posted_thought_id in (
         select id
         from public.thoughts
         where user_id = $1::uuid
       )
       or conversation_id in (
         select id
         from public.conversations
         where participant_a = $1::uuid
            or participant_b = $1::uuid
            or thought_id in (
              select id
              from public.thoughts
              where user_id = $1::uuid
            )
            or reply_id in (
              select id
              from public.replies
              where replier_id = $1::uuid
                 or thought_id in (
                   select id
                   from public.thoughts
                   where user_id = $1::uuid
                 )
            )
       )
  `,
    crossings: `
    select id
    from public.crossings
    where participant_a = $1::uuid
       or participant_b = $1::uuid
       or conversation_id in (
         select id
         from public.conversations
         where participant_a = $1::uuid
            or participant_b = $1::uuid
            or thought_id in (
              select id
              from public.thoughts
              where user_id = $1::uuid
            )
            or reply_id in (
              select id
              from public.replies
              where replier_id = $1::uuid
                 or thought_id in (
                   select id
                   from public.thoughts
                   where user_id = $1::uuid
                 )
            )
       )
       or source_draft_id in (
         select id
         from public.crossing_drafts
         where initiator_id = $1::uuid
            or auto_posted_thought_id in (
              select id
              from public.thoughts
              where user_id = $1::uuid
            )
       )
  `,
};
function quoteIdentifier(value) {
    return `"${value.replace(/"/g, "\"\"")}"`;
}
async function profileRoutes(app) {
    app.addHook("onRequest", auth_1.authenticate);
    app.get("/api/users/:id/profile", async (request, reply) => {
        try {
            const userId = (0, auth_1.getUserId)(request);
            if (!userId)
                return reply.status(401).send();
            const targetId = request.params.id;
            if (!UUID_PATTERN.test(targetId)) {
                return reply.status(404).send({ error: "Profile not found" });
            }
            const [user] = await db_1.db
                .select({
                id: db_1.users.id,
                name: db_1.users.name,
                photoUrl: db_1.users.photoUrl,
            })
                .from(db_1.users)
                .where((0, drizzle_orm_1.eq)(db_1.users.id, targetId))
                .limit(1);
            if (!user)
                return reply.status(404).send({ error: "Profile not found" });
            const rawThoughtsLimit = parseInt(request.query.thoughts_limit ?? "100", 10);
            const thoughtsLimit = Number.isFinite(rawThoughtsLimit) && rawThoughtsLimit > 0
                ? Math.min(rawThoughtsLimit, 200)
                : 100;
            let thoughtsForProfile = [];
            try {
                const userThoughts = await db_1.db
                    .select({
                    id: db_1.thoughts.id,
                    sentence: db_1.thoughts.sentence,
                    photoUrl: db_1.thoughts.photoUrl,
                    imageUrl: db_1.thoughts.imageUrl,
                    createdAt: db_1.thoughts.createdAt,
                })
                    .from(db_1.thoughts)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.thoughts.userId, targetId), (0, drizzle_orm_1.isNull)(db_1.thoughts.deletedAt)))
                    .orderBy((0, drizzle_orm_1.desc)(db_1.thoughts.createdAt))
                    .limit(thoughtsLimit);
                thoughtsForProfile = userThoughts.map((t) => ({
                    id: t.id,
                    sentence: t.sentence,
                    photo_url: t.photoUrl,
                    image_url: t.imageUrl,
                    created_at: t.createdAt?.toISOString() ?? null,
                }));
            }
            catch (error) {
                request.log.error({ error, targetId }, "profile thought hydration failed; returning profile without thoughts");
            }
            const rawCrossingsLimit = parseInt(request.query.crossings_limit ?? "100", 10);
            const crossingsLimit = Number.isFinite(rawCrossingsLimit) && rawCrossingsLimit > 0
                ? Math.min(rawCrossingsLimit, 200)
                : 100;
            let crossingsForProfile = [];
            try {
                const userCrossings = await db_1.db
                    .select({
                    id: db_1.crossings.id,
                    sentence: db_1.crossings.sentence,
                    context: db_1.crossings.context,
                    imageUrl: db_1.crossings.imageUrl,
                    createdAt: db_1.crossings.createdAt,
                    participantA: db_1.crossings.participantA,
                    participantB: db_1.crossings.participantB,
                })
                    .from(db_1.crossings)
                    .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(db_1.crossings.participantA, targetId), (0, drizzle_orm_1.eq)(db_1.crossings.participantB, targetId)))
                    .orderBy((0, drizzle_orm_1.desc)(db_1.crossings.createdAt))
                    .limit(crossingsLimit);
                const participantIds = [
                    ...new Set(userCrossings.flatMap((c) => [c.participantA, c.participantB])),
                ];
                const participantUsers = participantIds.length > 0
                    ? await db_1.db
                        .select({ id: db_1.users.id, name: db_1.users.name, photoUrl: db_1.users.photoUrl })
                        .from(db_1.users)
                        .where((0, drizzle_orm_1.inArray)(db_1.users.id, participantIds))
                    : [];
                const userInfoMap = new Map(participantUsers.map((p) => [
                    p.id,
                    { id: p.id, name: p.name, photo_url: p.photoUrl },
                ]));
                crossingsForProfile = userCrossings.map((c) => ({
                    id: c.id,
                    sentence: c.sentence,
                    context: c.context,
                    image_url: c.imageUrl,
                    created_at: c.createdAt?.toISOString() ?? null,
                    participant_a: userInfoMap.get(c.participantA) ?? {
                        id: c.participantA,
                        name: null,
                        photo_url: null,
                    },
                    participant_b: userInfoMap.get(c.participantB) ?? {
                        id: c.participantB,
                        name: null,
                        photo_url: null,
                    },
                }));
            }
            catch (error) {
                request.log.error({ error, targetId }, "profile crossing hydration failed; returning profile without crossings");
            }
            return reply.send({
                id: user.id,
                name: user.name,
                photo_url: user.photoUrl,
                thoughts: thoughtsForProfile,
                crossings: crossingsForProfile,
            });
        }
        catch (error) {
            request.log.error({ error, targetId: request.params.id }, "profile load failed");
            return reply.status(500).send({ error: "Internal server error" });
        }
    });
    app.put("/api/me/profile", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const body = request.body ?? {};
        const updates = {};
        if (typeof body.name === "string")
            updates.name = body.name.trim();
        if (typeof body.photo_url === "string")
            updates.photoUrl = body.photo_url.trim() || null;
        if (Array.isArray(body.interests)) {
            const arr = body.interests
                .slice(0, INTERESTS_MAX)
                .map((x) => (typeof x === "string" ? x.trim() : ""))
                .filter(Boolean);
            updates.interests = arr;
            // Re-embed for fallback: feed service embeds interests at query time from user row.
            // No persisted interest embedding column; next getFeed will use new interests.
        }
        if (Object.keys(updates).length === 0)
            return reply.status(400).send({ error: "no valid fields to update" });
        const [updated] = await db_1.db
            .update(db_1.users)
            .set(updates)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId))
            .returning();
        if (!updated)
            return reply.status(500).send();
        return reply.send({
            id: updated.id,
            name: updated.name,
            photo_url: updated.photoUrl,
            interests: (updated.interests ?? []),
        });
    });
    app.delete("/api/me/account", async (request, reply) => {
        const userId = (0, auth_1.getUserId)(request);
        if (!userId)
            return reply.status(401).send();
        const password = typeof request.body?.password === "string" ? request.body.password : "";
        const [user] = await db_1.db
            .select({
            id: db_1.users.id,
            passwordHash: db_1.users.passwordHash,
        })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId))
            .limit(1);
        if (!user)
            return reply.status(404).send({ error: "account not found" });
        if (user.passwordHash && !(await (0, password_1.verifyPassword)(password, user.passwordHash))) {
            return reply.status(400).send({ error: "incorrect password" });
        }
        try {
            await client_1.default.begin(async (tx) => {
                const sqlTx = tx;
                const existingTableRows = await sqlTx `
            select table_name
            from information_schema.tables
            where table_schema = 'public'
              and table_name = any(${[...OPTIONAL_DELETE_TABLES]})
          `;
                const existingTables = new Set(existingTableRows.map((row) => String(row.table_name)));
                if (existingTables.has("email_verification_codes")) {
                    await sqlTx `delete from public.email_verification_codes where user_id = ${userId}`;
                }
                if (existingTables.has("reports")) {
                    await sqlTx `
              delete from public.reports
              where reporter_id = ${userId} or target_user_id = ${userId}
            `;
                }
                if (existingTables.has("blocks")) {
                    await sqlTx `
              delete from public.blocks
              where blocker_id = ${userId} or blocked_id = ${userId}
            `;
                }
                if (existingTables.has("push_tokens")) {
                    await sqlTx `delete from public.push_tokens where user_id = ${userId}`;
                }
                if (existingTables.has("feed_serves")) {
                    await sqlTx `
              delete from public.feed_serves
              where viewer_id = ${userId}
                 or author_id = ${userId}
                 or thought_id in (
                   select id from public.thoughts where user_id = ${userId}
                 )
            `;
                }
                if (existingTables.has("feed_snapshots")) {
                    await sqlTx `delete from public.feed_snapshots where viewer_id = ${userId}`;
                }
                if (existingTables.has("user_feed_profiles")) {
                    await sqlTx `delete from public.user_feed_profiles where user_id = ${userId}`;
                }
                if (existingTables.has("crossing_replies")) {
                    await sqlTx `
              delete from public.crossing_replies
              where replier_id = ${userId}
                 or target_participant_id = ${userId}
                 or crossing_id in (
                   select id
                   from public.crossings
                   where participant_a = ${userId} or participant_b = ${userId}
                 )
            `;
                }
                if (existingTables.has("shifts")) {
                    await sqlTx `
              delete from public.shifts
              where participant_a = ${userId}
                 or participant_b = ${userId}
                 or conversation_id in (
                   select id
                   from public.conversations
                   where participant_a = ${userId} or participant_b = ${userId}
                 )
            `;
                }
                if (existingTables.has("shift_drafts")) {
                    await sqlTx `
              delete from public.shift_drafts
              where initiator_id = ${userId}
                 or conversation_id in (
                   select id
                   from public.conversations
                   where participant_a = ${userId} or participant_b = ${userId}
                 )
            `;
                }
                const dependentForeignKeyRows = await sqlTx `
            select tc.table_name, kcu.column_name, ccu.table_name as foreign_table_name
            from information_schema.table_constraints tc
            join information_schema.key_column_usage kcu
              on tc.constraint_name = kcu.constraint_name
             and tc.table_schema = kcu.table_schema
            join information_schema.constraint_column_usage ccu
              on ccu.constraint_name = tc.constraint_name
             and ccu.table_schema = tc.table_schema
            where tc.constraint_type = 'FOREIGN KEY'
              and tc.table_schema = 'public'
              and ccu.table_name = any(${[...DELETE_ROOT_TABLES]})
          `;
                for (const row of dependentForeignKeyRows) {
                    if (MANUALLY_HANDLED_DELETE_TABLES.has(row.table_name))
                        continue;
                    const idSelect = DELETE_ROOT_ID_SELECTS[row.foreign_table_name];
                    if (!idSelect)
                        continue;
                    await sqlTx.unsafe(`delete from public.${quoteIdentifier(row.table_name)}
               where ${quoteIdentifier(row.column_name)} in (${idSelect})`, [userId]);
                }
                await sqlTx `
            delete from public.messages
            where conversation_id in (
              select id
              from public.conversations
              where participant_a = ${userId} or participant_b = ${userId}
            )
               or sender_id = ${userId}
          `;
                await sqlTx `
            delete from public.crossings
            where participant_a = ${userId}
               or participant_b = ${userId}
               or conversation_id in (
                 select id
                 from public.conversations
                 where participant_a = ${userId} or participant_b = ${userId}
               )
          `;
                await sqlTx `
            delete from public.crossing_drafts
            where initiator_id = ${userId}
               or conversation_id in (
                 select id
                 from public.conversations
                 where participant_a = ${userId} or participant_b = ${userId}
               )
          `;
                await sqlTx `
            delete from public.user_recommendation_weights
            where user_id = ${userId}
          `;
                await sqlTx `
            delete from public.image_generations
            where user_id = ${userId}
               or thought_id in (
                 select id from public.thoughts where user_id = ${userId}
               )
          `;
                await sqlTx `
            delete from public.engagement_events
            where user_id = ${userId}
               or thought_id in (
                 select id from public.thoughts where user_id = ${userId}
               )
          `;
                await sqlTx `
            delete from public.failed_processing_jobs
            where thought_id in (
              select id from public.thoughts where user_id = ${userId}
            )
          `;
                await sqlTx `
            delete from public.conversations
            where participant_a = ${userId} or participant_b = ${userId}
          `;
                await sqlTx `
            delete from public.replies
            where replier_id = ${userId}
               or thought_id in (
                 select id from public.thoughts where user_id = ${userId}
               )
          `;
                await sqlTx `
            delete from public.thoughts
            where user_id = ${userId}
          `;
                await sqlTx `
            delete from public.users
            where id = ${userId}
          `;
            });
            return reply.status(204).send();
        }
        catch (error) {
            request.log.error({ error, userId }, "account deletion failed");
            return reply.status(500).send({ error: "Internal server error" });
        }
    });
}
