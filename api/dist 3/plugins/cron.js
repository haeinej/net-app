"use strict";
/**
 * Cron plugin: schedules daily learning, weekly learning, and retry failed jobs.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cronPlugin = cronPlugin;
const node_cron_1 = __importDefault(require("node-cron"));
const service_1 = require("../learning/service");
const service_2 = require("../thought-processing/service");
const autopost_1 = require("../crossings/autopost");
async function cronPlugin(app) {
    // Daily learning: 3am UTC
    node_cron_1.default.schedule("0 3 * * *", async () => {
        app.log.info("Cron: starting daily learning");
        try {
            const result = await (0, service_1.runDailyLearning)();
            app.log.info({ result }, "Cron: daily learning complete");
        }
        catch (err) {
            app.log.error({ err }, "Cron: daily learning failed");
        }
    }, { timezone: "UTC" });
    // Weekly learning: Sunday 4am UTC
    node_cron_1.default.schedule("0 4 * * 0", async () => {
        app.log.info("Cron: starting weekly learning");
        try {
            const result = await (0, service_1.runWeeklyLearning)();
            app.log.info({ result }, "Cron: weekly learning complete");
        }
        catch (err) {
            app.log.error({ err }, "Cron: weekly learning failed");
        }
    }, { timezone: "UTC" });
    // Retry failed jobs: every hour at :30
    node_cron_1.default.schedule("30 * * * *", async () => {
        app.log.info("Cron: reprocessing failed jobs");
        try {
            await (0, service_2.reprocessFailedJobs)();
            app.log.info("Cron: reprocess complete");
        }
        catch (err) {
            app.log.error({ err }, "Cron: reprocess failed");
        }
    }, { timezone: "UTC" });
    // Auto-post expired crossings: every 15 minutes
    node_cron_1.default.schedule("*/15 * * * *", async () => {
        app.log.info("Cron: auto-posting expired crossings");
        try {
            const result = await (0, autopost_1.autoPostExpiredCrossings)();
            app.log.info({ result }, "Cron: crossing auto-post complete");
        }
        catch (err) {
            app.log.error({ err }, "Cron: crossing auto-post failed");
        }
    }, { timezone: "UTC" });
    app.log.info("Cron jobs registered: daily@3am, weekly@Sun4am, retry@:30, crossing@15m");
}
