/**
 * Entry point for cron: run daily or weekly learning job.
 * Usage: npx tsx src/learning/cron.ts daily   (3am UTC)
 *        npx tsx src/learning/cron.ts weekly  (Sunday 4am UTC)
 */

import "dotenv/config";
import { runDailyLearning, runWeeklyLearning } from "./service";

const job = process.argv[2] ?? "daily";
async function main() {
  if (job === "weekly") {
    const result = await runWeeklyLearning();
    console.log("Weekly learning:", result.ok ? "ok" : "skipped", result.details);
    process.exit(result.ok ? 0 : 1);
  }
  const result = await runDailyLearning();
  console.log("Daily learning:", result.ok ? "ok" : "skipped", result.details);
  process.exit(result.ok ? 0 : 1);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
