import { setDefaultResultOrder } from "node:dns";
setDefaultResultOrder("ipv4first");
import postgres from "postgres";

/**
 * Database connection. Prefer Supabase connection pooler (port 6543) for reliability.
 * Set DATABASE_URL in api/.env, e.g.:
 *   postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 * See docs/DEBUGGING.md if you get EHOSTUNREACH with direct (port 5432) URLs.
 */
const connectionString =
  process.env.DATABASE_URL ??
  `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD ?? "localdev"}@localhost:5432/postgres`;

const sql = postgres(connectionString, {
  max: 10,
  idle_timeout: 30,
  ssl: process.env.DATABASE_URL?.includes("supabase") ? "require" : undefined,
});

export default sql;
