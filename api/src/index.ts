import { loadEnv } from "./env";
loadEnv();
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";

const DEV_CORS_ORIGINS = [
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^exp:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^exp:\/\/localhost(?::\d+)?$/,
  /^exp:\/\/.*$/,
];

const PUBLIC_WEB_ORIGINS = [
  "https://www.ohmmmm.com",
  "https://ohmmmm.com",
  "https://haeinej.github.io",
];

function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function main() {
  console.log("[boot] main() entered");
  const app = Fastify({ logger: true });
  console.log("[boot] fastify created");

  const corsOrigin = process.env.CORS_ORIGIN;
  const nodeEnv = process.env.NODE_ENV;
  const jwtSecret = process.env.JWT_SECRET;
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN?.trim() || "7d";
  const configuredCorsOrigins = parseCorsOrigins(corsOrigin);
  const corsOrigins = Array.from(new Set([...configuredCorsOrigins, ...PUBLIC_WEB_ORIGINS]));

  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be set to a strong, random value");
  }
  if (nodeEnv === "production" && configuredCorsOrigins.length === 0) {
    throw new Error("CORS_ORIGIN must be set in production");
  }

  console.log("[boot] registering cors...");
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      if (nodeEnv !== "production" && DEV_CORS_ORIGINS.some((pattern) => pattern.test(origin))) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed"), false);
    },
  });
  console.log("[boot] registering jwt...");
  await app.register(jwt, {
    secret: jwtSecret,
    sign: { expiresIn: jwtExpiresIn },
  });
  console.log("[boot] registering rateLimit...");
  await app.register(rateLimit, {
    max: 60,
    timeWindow: "1 minute",
    keyGenerator: (req) => {
      const user = (req as any).user as { sub?: string } | undefined;
      if (user?.sub) return `user:${user.sub}`;
      return `ip:${req.ip}`;
    },
  });
  console.log("[boot] registering websocket...");
  await app.register(websocket);
  console.log("[boot] core plugins done");

  app.get("/health", async () => ({ status: "ok" }));

  const { authRoutes } = await import("./routes/auth");
  const { waitlistRoutes } = await import("./routes/waitlist");
  console.log("[boot] routes imported");
  const { thoughtRoutes } = await import("./routes/thoughts");
  const { feedRoutes } = await import("./routes/feed");
  const { replyRoutes } = await import("./routes/replies");
  const { notificationRoutes } = await import("./routes/notifications");
  const { conversationRoutes } = await import("./routes/conversations");
  const { crossingRoutes } = await import("./routes/crossings");
  const { profileRoutes } = await import("./routes/profile");
  const { engagementRoutes } = await import("./engagement");
  const { internalFeedMetricsRoutes } = await import("./routes/internal-feed-metrics");
  const { moderationRoutes } = await import("./routes/moderation");

  await app.register(waitlistRoutes);
  await app.register(authRoutes);
  await app.register(thoughtRoutes);
  await app.register(feedRoutes);
  await app.register(replyRoutes);
  await app.register(notificationRoutes);
  await app.register(conversationRoutes);
  await app.register(crossingRoutes);
  await app.register(profileRoutes);
  await app.register(engagementRoutes);
  await app.register(internalFeedMetricsRoutes);
  await app.register(moderationRoutes);

  console.log("[boot] routes registered, loading cron...");
  const { cronPlugin } = await import("./plugins/cron");
  await app.register(cronPlugin);

  console.log("[boot] cron registered, listening...");
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`API running on http://localhost:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
