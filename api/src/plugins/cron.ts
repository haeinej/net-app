/**
 * Cron plugin: schedules daily learning, weekly learning, and retry failed jobs.
 */

import cron from "node-cron";
import type { FastifyInstance } from "fastify";
import { runDailyLearning, runWeeklyLearning } from "../learning/service";
import { reprocessFailedJobs } from "../thought-processing/service";
import { clearExpiredConversationHistories } from "../conversations/history";

export async function cronPlugin(app: FastifyInstance): Promise<void> {
  // Daily learning: 3am UTC
  cron.schedule(
    "0 3 * * *",
    async () => {
      app.log.info("Cron: starting daily learning");
      try {
        const result = await runDailyLearning();
        app.log.info({ result }, "Cron: daily learning complete");
      } catch (err) {
        app.log.error({ err }, "Cron: daily learning failed");
      }
    },
    { timezone: "UTC" }
  );

  // Weekly learning: Sunday 4am UTC
  cron.schedule(
    "0 4 * * 0",
    async () => {
      app.log.info("Cron: starting weekly learning");
      try {
        const result = await runWeeklyLearning();
        app.log.info({ result }, "Cron: weekly learning complete");
      } catch (err) {
        app.log.error({ err }, "Cron: weekly learning failed");
      }
    },
    { timezone: "UTC" }
  );

  // Retry failed jobs: every hour at :30
  cron.schedule(
    "30 * * * *",
    async () => {
      app.log.info("Cron: reprocessing failed jobs");
      try {
        await reprocessFailedJobs();
        app.log.info("Cron: reprocess complete");
      } catch (err) {
        app.log.error({ err }, "Cron: reprocess failed");
      }
    },
    { timezone: "UTC" }
  );

  // Clear expired conversation histories: every hour at :10
  cron.schedule(
    "10 * * * *",
    async () => {
      app.log.info("Cron: clearing expired conversation histories");
      try {
        const clearedCount = await clearExpiredConversationHistories();
        app.log.info({ clearedCount }, "Cron: expired conversation history cleanup complete");
      } catch (err) {
        app.log.error({ err }, "Cron: expired conversation history cleanup failed");
      }
    },
    { timezone: "UTC" }
  );

  app.log.info("Cron jobs registered: daily@3am, weekly@Sun4am, retry@:30, history@:10");
}
