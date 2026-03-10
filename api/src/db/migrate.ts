/**
 * Runs pending Drizzle migrations (SQL files in drizzle/).
 * Usage: npm run db:migrate
 */
import "dotenv/config";
import { setDefaultResultOrder } from "node:dns";
setDefaultResultOrder("ipv4first");
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}
// Supabase (and most cloud Postgres): use SSL. Local postgres: no SSL.
const useSsl = url.includes("supabase") || url.includes("pooler.supabase");
const sql = postgres(url, { max: 1, ssl: useSsl ? "require" : false });

const MIGRATIONS_DIR = join(process.cwd(), "drizzle");

async function ensureMigrationsTable() {
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      name text NOT NULL UNIQUE,
      applied_at timestamptz DEFAULT now()
    )
  `;
}

async function appliedMigrations(): Promise<string[]> {
  const rows = await sql`
    SELECT name FROM drizzle.__drizzle_migrations ORDER BY name
  `;
  return (rows as unknown as { name: string }[]).map((r) => r.name);
}

async function recordMigration(name: string) {
  await sql`
    INSERT INTO drizzle.__drizzle_migrations (name) VALUES (${name})
  `;
}

/** Split SQL file into single statements (postgres.js runs one at a time) */
function splitSqlStatements(content: string): string[] {
  const parts = content.split(/;\s*\n/);
  const statements: string[] = [];
  for (const part of parts) {
    // Strip leading comment lines and whitespace
    let st = part.replace(/^\s*(?:--[^\n]*\n?\s*)*/g, "").trim();
    if (st.length > 0) statements.push(st + ";");
  }
  return statements;
}

async function runMigrationFile(filePath: string) {
  const content = readFileSync(filePath, "utf-8");
  const statements = splitSqlStatements(content);
  for (const statement of statements) {
    if (statement.trim() === ";") continue;
    await sql.unsafe(statement);
  }
}

async function main() {
  await ensureMigrationsTable();
  const applied = await appliedMigrations();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const name = file.replace(/\.sql$/, "");
    if (applied.includes(name)) {
      console.log("Skip (already applied):", file);
      continue;
    }
    console.log("Running:", file);
    const path = join(MIGRATIONS_DIR, file);
    await runMigrationFile(path);
    await recordMigration(name);
    console.log("Applied:", file);
  }
  await sql.end();
  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
