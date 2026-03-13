import { loadEnv } from "./env";
loadEnv();
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";

async function main() {
  console.log("[boot] main() entered");
  const app = Fastify({ logger: true });
  console.log("[boot] fastify created");

  const corsOrigin = process.env.CORS_ORIGIN;
  const nodeEnv = process.env.NODE_ENV;
  const jwtSecret = process.env.JWT_SECRET;

  if (nodeEnv === "production") {
    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error("JWT_SECRET must be set to a strong, random value in production");
    }
    if (!corsOrigin) {
      throw new Error("CORS_ORIGIN must be set in production");
    }
  }

  console.log("[boot] registering cors...");
  await app.register(cors, {
    origin:
      nodeEnv === "production"
        ? (corsOrigin ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : corsOrigin ?? true,
  });
  console.log("[boot] registering jwt...");
  await app.register(jwt, {
    secret: jwtSecret ?? "development-only-secret",
    sign: { expiresIn: "30d" },
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
  console.log("[boot] routes imported");
  const { thoughtRoutes } = await import("./routes/thoughts");
  const { feedRoutes } = await import("./routes/feed");
  const { replyRoutes } = await import("./routes/replies");
  const { notificationRoutes } = await import("./routes/notifications");
  const { conversationRoutes } = await import("./routes/conversations");
  const { crossingShiftRoutes } = await import("./routes/crossing-shift");
  const { profileRoutes } = await import("./routes/profile");
  const { engagementRoutes } = await import("./engagement");

  await app.register(authRoutes);
  await app.register(thoughtRoutes);
  await app.register(feedRoutes);
  await app.register(replyRoutes);
  await app.register(notificationRoutes);
  await app.register(conversationRoutes);
  await app.register(crossingShiftRoutes);
  await app.register(profileRoutes);
  await app.register(engagementRoutes);

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
