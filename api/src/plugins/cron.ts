/**
 * Cron plugin: schedules daily learning, weekly learning, retry failed jobs,
 * and midnight feed rotation.
 */

import cron from "node-cron";
import type { FastifyInstance } from "fastify";
import { runDailyLearning, runWeeklyLearning } from "../learning/service";
import { reprocessFailedJobs } from "../thought-processing/service";
import { invalidateFeedCache } from "../feed";

export async function cronPlugin(app: FastifyInstance): Promise<void> {
  // Feed rotation: clear all cached snapshots at 12am and 12pm UTC so users get fresh feeds
  cron.schedule(
    "0 0,12 * * *",
    async () => {
      app.log.info("Cron: invalidating all feed snapshots for feed rotation");
      try {
        await invalidateFeedCache();
        app.log.info("Cron: feed snapshot invalidation complete");
      } catch (err) {
        app.log.error({ err }, "Cron: feed snapshot invalidation failed");
      }
    },
    { timezone: "UTC" }
  );

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
  app.log.info("Cron jobs registered: feed-rotation@12am+12pm, daily@3am, weekly@Sun4am, retry@:30");
}
