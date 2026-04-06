"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Runs pending Drizzle migrations (SQL files in drizzle/).
 * Usage: npm run db:migrate
 */
const env_1 = require("../env");
(0, env_1.loadEnv)();
const node_dns_1 = require("node:dns");
(0, node_dns_1.setDefaultResultOrder)("ipv4first");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const postgres_1 = __importDefault(require("postgres"));
const url = process.env.DATABASE_URL;
if (!url) {
    console.error("DATABASE_URL is not set in api/.env.local or api/.env");
    process.exit(1);
}
// Supabase (and most cloud Postgres): use SSL. Local postgres: no SSL.
const useSsl = url.includes("supabase") || url.includes("pooler.supabase");
const sql = (0, postgres_1.default)(url, { max: 1, ssl: useSsl ? "require" : false });
const MIGRATIONS_DIR = (0, node_path_1.join)(process.cwd(), "drizzle");
async function ensureMigrationsTable() {
    await sql `CREATE SCHEMA IF NOT EXISTS drizzle`;
    await sql `
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      name text NOT NULL UNIQUE,
      applied_at timestamptz DEFAULT now()
    )
  `;
}
async function appliedMigrations() {
    const rows = await sql `
    SELECT name FROM drizzle.__drizzle_migrations ORDER BY name
  `;
    return rows.map((r) => r.name);
}
async function recordMigration(name) {
    await sql `
    INSERT INTO drizzle.__drizzle_migrations (name) VALUES (${name})
  `;
}
/** Split SQL file into single statements (postgres.js runs one at a time) */
function splitSqlStatements(content) {
    const parts = content.split(/;\s*\n/);
    const statements = [];
    for (const part of parts) {
        // Strip leading comment lines and whitespace
        let st = part.replace(/^\s*(?:--[^\n]*\n?\s*)*/g, "").trim();
        if (st.length > 0)
            statements.push(st + ";");
    }
    return statements;
}
async function runMigrationFile(filePath) {
    const content = (0, node_fs_1.readFileSync)(filePath, "utf-8");
    const statements = splitSqlStatements(content);
    for (const statement of statements) {
        if (statement.trim() === ";")
            continue;
        await sql.unsafe(statement);
    }
}
async function main() {
    await ensureMigrationsTable();
    const applied = await appliedMigrations();
    const files = (0, node_fs_1.readdirSync)(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();
    for (const file of files) {
        const name = file.replace(/\.sql$/, "");
        if (applied.includes(name)) {
            console.log("Skip (already applied):", file);
            continue;
        }
        console.log("Running:", file);
        const path = (0, node_path_1.join)(MIGRATIONS_DIR, file);
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
