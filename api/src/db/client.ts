import postgres from "postgres";

/**
 * Database connection — works with both local PostgreSQL and Supabase.
 * Set DATABASE_URL in .env to your Supabase connection string:
 *   postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 */
const connectionString =
  process.env.DATABASE_URL ??
  `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD ?? "localdev"}@db.${(process.env.SUPABASE_URL ?? "").replace("https://", "").replace(".supabase.co", "")}.supabase.co:5432/postgres`;

const sql = postgres(connectionString, {
  max: 10,
  idle_timeout: 30,
  ssl: process.env.DATABASE_URL?.includes("supabase") ? "require" : undefined,
});

export default sql;
