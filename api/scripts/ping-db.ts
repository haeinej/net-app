/**
 * Quick DB connection test. Run: npx tsx scripts/ping-db.ts
 * Use this to verify DATABASE_URL before running migrations.
 */
import { loadEnv } from "../src/env";
loadEnv();
import { setDefaultResultOrder } from "node:dns";
setDefaultResultOrder("ipv4first");
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set in api/.env.local or api/.env");
  process.exit(1);
}

const useSsl = url.includes("supabase") || url.includes("pooler.supabase");
const safeUrl = url.replace(/:([^:@]+)@/, ":****@");

console.log("Connecting to DB...", safeUrl);
const sql = postgres(url, { max: 1, ssl: useSsl ? "require" : false });

sql`SELECT 1 as ok`
  .then((rows) => {
    console.log("OK — DB connection works.", rows);
    sql.end();
    process.exit(0);
  })
  .catch((err) => {
    console.error("Connection failed:", err.message);
    if (err.message.includes("EHOSTUNREACH") || err.code === "EHOSTUNREACH") {
      console.error("\n→ Use the Supabase Connection pooler URL (port 6543), not direct (5432).");
      console.error("  See docs/DEBUGGING.md");
    }
    sql.end();
    process.exit(1);
  });
