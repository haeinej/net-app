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

  console.log("[boot] registering cors...");
  await app.register(cors, { origin: process.env.CORS_ORIGIN ?? true });
  console.log("[boot] registering jwt...");
  await app.register(jwt, { secret: process.env.JWT_SECRET ?? "change-me" });
  console.log("[boot] registering rateLimit...");
  await app.register(rateLimit, {
    max: 60,
    timeWindow: "1 minute",
    keyGenerator: (req) => (req.headers.authorization as string) ?? req.ip,
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
