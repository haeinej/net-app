/**
 * Auth: register (onboarding step 1) and login.
 * JWT payload: { sub: user.id }
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, users } from "../db";

const PBKDF2_ITERATIONS = 100000;
const KEY_LEN = 64;
const SALT_LEN = 16;

function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN).toString("hex");
  const hash = pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LEN,
    "sha256"
  ).toString("hex");
  return `${salt}.${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(".");
  if (!salt || !hash) return false;
  const computed = pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LEN,
    "sha256"
  ).toString("hex");
  return computed === hash;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: {
      name?: string;
      photo_url?: string;
      cohort_year?: number;
      current_city?: string;
      concentration?: string;
      email?: string;
      password?: string;
    };
  }>("/api/auth/register", async (request, reply) => {
    const body = request.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const photoUrl = typeof body.photo_url === "string" ? body.photo_url.trim() || null : null;
    const cohortYear =
      typeof body.cohort_year === "number" && body.cohort_year >= 2020 && body.cohort_year <= 2030
        ? body.cohort_year
        : null;
    const currentCity =
      typeof body.current_city === "string" ? body.current_city.trim() || null : null;
    const concentration =
      typeof body.concentration === "string" ? body.concentration.trim() || null : null;
    const email = typeof body.email === "string" ? body.email.trim() || null : null;
    const password = typeof body.password === "string" ? body.password : "";

    if (!name) return reply.status(400).send({ error: "name required" });
    if (!email) return reply.status(400).send({ error: "email required" });
    if (!password || password.length < 8)
      return reply.status(400).send({ error: "password required, min 8 characters" });

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0)
      return reply.status(409).send({ error: "email already registered" });

    const passwordHash = hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({
        name,
        photoUrl,
        cohortYear,
        currentCity,
        concentration,
        email,
        passwordHash,
      })
      .returning({ id: users.id });

    if (!user) return reply.status(500).send();
    const token = app.jwt.sign({ sub: user.id });
    return reply.send({ token, user_id: user.id });
  });

  app.post<{
    Body: { email?: string; password?: string };
  }>("/api/auth/login", async (request, reply) => {
    const body = request.body ?? {};
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password)
      return reply.status(400).send({ error: "email and password required" });

    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash))
      return reply.status(401).send({ error: "Incorrect email or password" });

    const token = app.jwt.sign({ sub: user.id });
    return reply.send({ token, user_id: user.id });
  });
}
