/**
 * Seed 3 invite codes for every verified user who doesn't have any yet.
 * Run once after migration: npx tsx api/scripts/seed-invites.ts
 */
import { loadEnv } from "../src/env";
loadEnv();

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, isNotNull, sql } from "drizzle-orm";
import { users, inviteCodes } from "../src/db/schema";
import { generateInviteCode, MAX_INVITES_PER_USER } from "../src/lib/invite";

async function main() {
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client);

  // Get verified users who have no invite codes yet
  const verifiedUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(isNotNull(users.emailVerifiedAt));

  const existingCreators = await db
    .select({ createdByUserId: inviteCodes.createdByUserId })
    .from(inviteCodes)
    .groupBy(inviteCodes.createdByUserId);

  const existingSet = new Set(existingCreators.map((r) => r.createdByUserId));
  const toSeed = verifiedUsers.filter((u) => !existingSet.has(u.id));

  console.log(`Found ${toSeed.length} verified users without invite codes`);

  let seeded = 0;
  for (const user of toSeed) {
    for (let i = 0; i < MAX_INVITES_PER_USER; i++) {
      let attempts = 0;
      while (true) {
        const code = generateInviteCode();
        try {
          await db.insert(inviteCodes).values({ code, createdByUserId: user.id });
          break;
        } catch (err: unknown) {
          attempts++;
          const isUniqueViolation =
            err &&
            typeof err === "object" &&
            "code" in err &&
            (err as { code: string }).code === "23505";
          if (!isUniqueViolation || attempts >= 5) {
            console.warn(`Failed to seed code for user ${user.id} after ${attempts} attempts`);
            break;
          }
        }
      }
    }
    seeded++;
  }

  console.log(`Seeded invite codes for ${seeded} users`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
