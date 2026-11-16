import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig({
  worker: {
    name: "no-sugar",
    compatibilityDate: "2026-11-10",
    entrypoint: "./src/index.js",
    observability: { enabled: true },
    env: {
      DB: bindings.d1({ name: "no-sugar" }),
      TIMEZONE: bindings.text("Europe/Paris"), // default for new users, each can /timezone
      BOT_TOKEN: bindings.secret(), // from @BotFather
      WEBHOOK_SECRET: bindings.secret(), // random string, also passed to setWebhook
      OWNER_ID: bindings.secret(), // your Telegram user id; only you can /allow and /remove people
    },
    // Every 30 min. The Worker checks local time and only sends at slot times,
    // so daylight saving changes need no cron edits.
    triggers: [triggers.scheduled({ schedule: "*/5 * * * *" })],
  },
});
