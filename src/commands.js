// Command menus ("/" list in Telegram), in one place.
// Everyone sees USER_COMMANDS. The owner sees USER_COMMANDS + OWNER_COMMANDS: a chat-scoped
// list replaces the default one, so it has to repeat the user commands.
// Add a command here when you add its handler. Applied on every release (deploy workflow,
// scripts/set-commands.js) and when the owner sends /start.

export const USER_COMMANDS = [
  { command: "refused", description: "I refused sugar" },
  { command: "sugar", description: "I had sugar" },
  { command: "undo", description: "Remove the last moment" },
  { command: "reminders", description: "Your reminders: list and edit" },
  { command: "stats", description: "Streak and counts" },
  { command: "timezone", description: "Show or change your timezone" },
  { command: "widget", description: "iPhone home screen widget (Scriptable)" },
  { command: "start", description: "Show buttons and calendar" },
];

export const OWNER_COMMANDS = [
  { command: "allow", description: "Owner: /allow <user id>" },
  { command: "remove", description: "Owner: /remove <user id>" },
  { command: "users", description: "Owner: list allowed users" },
  { command: "broadcast", description: "Owner: /broadcast <text> to all users" },
];

// Sets both menus: default scope (everyone), then the owner's chat.
// Never throws: returns [{ scope, ok, error }] so callers decide how to report.
export async function applyMenus(botToken, ownerId) {
  const requests = [
    { scope: "default", body: { commands: USER_COMMANDS } },
    {
      scope: "owner",
      body: {
        scope: { type: "chat", chat_id: Number(ownerId) },
        commands: [...USER_COMMANDS, ...OWNER_COMMANDS],
      },
    },
  ];
  const results = [];
  for (const { scope, body } of requests) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json();
      results.push({ scope, ok: data.ok === true, error: data.ok ? undefined : data.description });
    } catch (err) {
      results.push({ scope, ok: false, error: String(err) });
    }
  }
  return results;
}
