"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("./env");
(0, env_1.loadEnv)();
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const compress_1 = __importDefault(require("@fastify/compress"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
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
    "https://api.ohmmmm.com",
    "https://haeinej.github.io",
];
function parseCorsOrigins(raw) {
    return (raw ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}
async function main() {
    console.log("[boot] main() entered");
    const app = (0, fastify_1.default)({ logger: true });
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
    app.addHook("onResponse", async (request, reply) => {
        const route = request.routeOptions.url ?? request.raw.url ?? "unknown";
        const method = request.method;
        const statusCode = reply.statusCode;
        const durationMs = typeof reply.elapsedTime === "number" && reply.elapsedTime > 0
            ? reply.elapsedTime
            : 0;
        const userId = request.user?.sub ?? null;
        request.log.info({
            route,
            method,
            statusCode,
            duration_ms: Math.round(durationMs),
            user_id: userId,
        }, "request_completed");
    });
    console.log("[boot] registering compress...");
    await app.register(compress_1.default, { threshold: 1024 });
    console.log("[boot] registering cors...");
    await app.register(cors_1.default, {
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
    await app.register(jwt_1.default, {
        secret: jwtSecret,
        sign: { expiresIn: jwtExpiresIn },
    });
    console.log("[boot] registering rateLimit...");
    await app.register(rate_limit_1.default, {
        max: 60,
        timeWindow: "1 minute",
        keyGenerator: (req) => {
            const user = req.user;
            if (user?.sub)
                return `user:${user.sub}`;
            return `ip:${req.ip}`;
        },
    });
    console.log("[boot] registering websocket...");
    await app.register(websocket_1.default);
    console.log("[boot] core plugins done");
    app.get("/health", async () => ({ status: "ok" }));
    const { authRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/auth")));
    const { waitlistRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/waitlist")));
    console.log("[boot] routes imported");
    const { thoughtRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/thoughts")));
    const { feedRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/feed")));
    const { replyRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/replies")));
    const { notificationRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/notifications")));
    const { conversationRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/conversations")));
    const { crossingRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/crossings")));
    const { profileRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/profile")));
    const { engagementRoutes } = await Promise.resolve().then(() => __importStar(require("./engagement")));
    const { internalFeedMetricsRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/internal-feed-metrics")));
    const { moderationRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/moderation")));
    const { pushRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/push")));
    const { inviteRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/invites")));
    const { internalMatchmakerRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/internal-matchmaker")));
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
    await app.register(pushRoutes);
    await app.register(inviteRoutes);
    await app.register(internalMatchmakerRoutes);
    console.log("[boot] routes registered, loading cron...");
    const { cronPlugin } = await Promise.resolve().then(() => __importStar(require("./plugins/cron")));
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
