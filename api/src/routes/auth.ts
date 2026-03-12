/**
 * Auth: register (onboarding step 1) and login.
 * JWT payload: { sub: user.id }
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db, users } from "../db";
import { getOnboardingStateForUser } from "../lib/onboarding";
import { hashPassword, verifyPassword } from "../lib/password";

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalTrimmedString(value: unknown): string | null {
  const normalized = readTrimmedString(value);
  return normalized || null;
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
    const name = readTrimmedString(body.name);
    const photoUrl = readOptionalTrimmedString(body.photo_url);
    const cohortYear =
      typeof body.cohort_year === "number" && body.cohort_year >= 2020 && body.cohort_year <= 2030
        ? body.cohort_year
        : null;
    const currentCity = readOptionalTrimmedString(body.current_city);
    const concentration = readOptionalTrimmedString(body.concentration);
    const email = readOptionalTrimmedString(body.email);
    const password = typeof body.password === "string" ? body.password : "";

    if (!name) return reply.status(400).send({ error: "name required" });
    if (!email) return reply.status(400).send({ error: "email required" });
    if (!password || password.length < 8)
      return reply.status(400).send({ error: "password required, min 8 characters" });

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0)
      return reply.status(409).send({ error: "email already registered" });

    const passwordHash = await hashPassword(password);
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
    return reply.status(201).send({
      token,
      user_id: user.id,
      onboarding_step: 2,
      onboarding_complete: false,
    });
  });

  app.post<{
    Body: { email?: string; password?: string };
  }>("/api/auth/login", async (request, reply) => {
    const body = request.body ?? {};
    const email = readTrimmedString(body.email);
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password)
      return reply.status(400).send({ error: "email and password required" });

    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (
      !user ||
      !user.passwordHash ||
      !(await verifyPassword(password, user.passwordHash))
    )
      return reply.status(401).send({ error: "Incorrect email or password" });

    const token = app.jwt.sign({ sub: user.id });
    const onboardingState = await getOnboardingStateForUser(user.id);
    return reply.send({
      token,
      user_id: user.id,
      ...onboardingState,
    });
  });
}
