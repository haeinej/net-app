import { setDefaultResultOrder } from "node:dns";
setDefaultResultOrder("ipv4first");
import postgres from "postgres";
import { loadEnv } from "../env";

loadEnv();

/**
 * Database connection. Prefer Supabase connection pooler (port 6543) for reliability.
 * Set DATABASE_URL in api/.env, e.g.:
 *   postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 * See docs/DEBUGGING.md if you get EHOSTUNREACH with direct (port 5432) URLs.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add api/.env.local or api/.env.");
}

const sql = postgres(connectionString, {
  max: 40,
  idle_timeout: 20,
  connect_timeout: 10,
  keep_alive: 60,
  ssl: connectionString.includes("supabase") ? "require" : undefined,
});

export default sql;
