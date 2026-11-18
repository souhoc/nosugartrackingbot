// Sets the bot's "/" command menus from src/commands.js. Run by the deploy workflow.
// Needs BOT_TOKEN and OWNER_ID in the environment. Exits 1 if Telegram refuses.
import { menuRequests } from "../src/commands.js";

const { BOT_TOKEN, OWNER_ID } = process.env;
if (!BOT_TOKEN || !OWNER_ID) {
  console.error("BOT_TOKEN and OWNER_ID must be set");
  process.exit(1);
}

let failed = false;
for (const body of menuRequests(OWNER_ID)) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const scope = body.scope ? "owner" : "default";
  console.log(`setMyCommands ${scope}:`, data.ok ? "ok" : data.description);
  if (!data.ok) failed = true;
}
process.exit(failed ? 1 : 0);
