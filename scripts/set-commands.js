// Sets the bot's "/" command menus from src/commands.js. Run by the deploy workflow.
// Needs BOT_TOKEN and OWNER_ID in the environment. Exits 1 if Telegram refuses.
import { applyMenus } from "../src/commands.js";

const { BOT_TOKEN, OWNER_ID } = process.env;
if (!BOT_TOKEN || !OWNER_ID) {
  console.error("BOT_TOKEN and OWNER_ID must be set");
  process.exit(1);
}

const results = await applyMenus(BOT_TOKEN, OWNER_ID);
for (const r of results) console.log(`setMyCommands ${r.scope}:`, r.ok ? "ok" : r.error);
process.exit(results.every((r) => r.ok) ? 0 : 1);
