"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_dns_1 = require("node:dns");
(0, node_dns_1.setDefaultResultOrder)("ipv4first");
const postgres_1 = __importDefault(require("postgres"));
const env_1 = require("../env");
(0, env_1.loadEnv)();
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
const sql = (0, postgres_1.default)(connectionString, {
    max: 25,
    idle_timeout: 30,
    connect_timeout: 10,
    ssl: connectionString.includes("supabase") ? "require" : undefined,
});
exports.default = sql;
