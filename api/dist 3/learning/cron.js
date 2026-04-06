"use strict";
/**
 * Entry point for cron: run daily or weekly learning job.
 * Usage: npx tsx src/learning/cron.ts daily   (3am UTC)
 *        npx tsx src/learning/cron.ts weekly  (Sunday 4am UTC)
 */
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("../env");
(0, env_1.loadEnv)();
const service_1 = require("./service");
const job = process.argv[2] ?? "daily";
async function main() {
    if (job === "weekly") {
        const result = await (0, service_1.runWeeklyLearning)();
        console.log("Weekly learning:", result.ok ? "ok" : "skipped", result.details);
        process.exit(result.ok ? 0 : 1);
    }
    const result = await (0, service_1.runDailyLearning)();
    console.log("Daily learning:", result.ok ? "ok" : "skipped", result.details);
    process.exit(result.ok ? 0 : 1);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
