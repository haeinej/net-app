import { drizzle } from "drizzle-orm/postgres-js";
import sql from "./client";
import * as schema from "./schema";

/**
 * Drizzle ORM client for typed queries. Use this for selects/inserts/updates.
 * For raw SQL or migrations, use the default export from ./client.js.
 */
export const db = drizzle(sql, { schema });
export * from "./schema.js";
