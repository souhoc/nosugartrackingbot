// No-sugar bot: asks at each user's own reminder times, records answers and moments, serves a calendar Mini App.
// Multi-user: the owner (OWNER_ID) plus anyone the owner added with /allow.
// Each user has their own data, timezone and reminders.

// Offered to new users ("Use the defaults"). The `slot` ids are what old checks (before custom reminders) used.
const DEFAULT_REMINDERS = [
  { slot: "morning", time: "10:00", emoji: "☀️", message: "Morning check: did you eat sugar since the last check?" },
  { slot: "lunch", time: "12:30", emoji: "🥗", message: "Lunch check: did you eat sugar since the last check?" },
  { slot: "break", time: "16:00", emoji: "☕", message: "Break check: did you eat sugar since the last check?" },
  { slot: "dinner", time: "19:00", emoji: "🍽️", message: "Dinner check: did you eat sugar since the last check?" },
];
const MAX_REMINDERS = 12;
// Cron runs every 5 min, so reminder times must be on a 5-minute mark.
const TIME_RE = /^([01]\d|2[0-3]):[0-5][05]$/;

const BTN_REFUSED = "💪 Refused sugar";
const BTN_SUGAR = "🍬 Had sugar";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/webhook" && request.method === "POST") {
      return handleWebhook(request, env, url);
    }
    if (url.pathname === "/api/stats") {
      return handleStats(request, env);
    }
    if (url.pathname === "/api/reminders" && request.method === "PUT") {
      return handleSaveReminders(request, env, url);
    }
    if (url.pathname === "/api/widget") {
      return handleWidget(request, env);
    }
    return new Response("Not found", { status: 404 });
  },

  // Runs every 5 min. Sends each reminder whose time matches its user's local time.
  async scheduled(controller, env) {
    // Only reminders of users still allowed: the owner, or present in the allowlist.
    const { results: reminders } = await env.DB.prepare(
      `SELECT r.id, r.user_id, r.time, r.emoji, r.message, u.timezone
       FROM reminders r JOIN users u ON u.user_id = r.user_id
       WHERE r.user_id = ? OR r.user_id IN (SELECT user_id FROM allowlist)`
    )
      .bind(Number(env.OWNER_ID))
      .all();

    for (const reminder of reminders) {
      const { date, time } = localNow(controller.scheduledTime, reminder.timezone);
      if (time !== reminder.time) continue;

      console.log("sending reminder", { userId: reminder.user_id, date, reminderId: reminder.id });
      await sendQuestion(env, reminder, date);
    }
  },
};

// ---------- Users ----------

function isOwner(env, userId) {
  return String(userId) === String(env.OWNER_ID);
}

async function isAllowed(env, userId) {
  if (isOwner(env, userId)) return true;
  const row = await env.DB.prepare("SELECT 1 FROM allowlist WHERE user_id = ?").bind(userId).first();
  return row !== null;
}

// ---------- Owner commands: /allow <id>, /remove <id>, /users ----------

async function handleOwnerCommand(env, ownerId, text) {
  const [command, arg] = text.split(/\s+/);

  if (command === "/users") {
    const { results } = await env.DB.prepare(
      `SELECT a.user_id, u.name, u.timezone FROM allowlist a
       LEFT JOIN users u ON u.user_id = a.user_id ORDER BY a.added`
    ).all();
    const lines = results.map((r) => {
      const who = r.name ? `${r.name} (${r.user_id})` : `${r.user_id} (hasn't sent /start yet)`;
      return `• ${who}${r.timezone ? `, ${r.timezone}` : ""}`;
    });
    await tg(env, "sendMessage", {
      chat_id: ownerId,
      text: lines.length > 0 ? `Allowed users:\n${lines.join("\n")}` : "Nobody else is allowed yet. Use /allow <user id>.",
    });
    return;
  }

  const targetId = Number(arg);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    await tg(env, "sendMessage", { chat_id: ownerId, text: `Usage: ${command} <user id>` });
    return;
  }
  if (isOwner(env, targetId)) {
    await tg(env, "sendMessage", { chat_id: ownerId, text: "That's you, you're always allowed." });
    return;
  }

  if (command === "/allow") {
    await env.DB.prepare("INSERT OR IGNORE INTO allowlist (user_id, added) VALUES (?, ?)")
      .bind(targetId, new Date().toISOString())
      .run();
    console.log("owner allowed user", targetId);
    await tg(env, "sendMessage", { chat_id: ownerId, text: `✅ ${targetId} can now use the bot.` });
    // Works only if they already opened the bot (e.g. got the "private" reply). Failure is fine.
    await tg(env, "sendMessage", { chat_id: targetId, text: "🎉 You now have access. Send /start to begin." });
    return;
  }

  // /remove: they lose access and reminders stop. Their data is kept.
  const { meta } = await env.DB.prepare("DELETE FROM allowlist WHERE user_id = ?").bind(targetId).run();
  console.log("owner removed user", targetId, "rows", meta.changes);
  await tg(env, "sendMessage", {
    chat_id: ownerId,
    text: meta.changes > 0 ? `🚫 ${targetId} removed. Their data is kept.` : `${targetId} was not in the list.`,
  });
}

// Creates the user on first contact, keeps their name fresh after that.
async function upsertUser(env, from) {
  await env.DB.prepare(
    `INSERT INTO users (user_id, name, timezone, created) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET name = excluded.name`
  )
    .bind(from.id, from.first_name || null, env.TIMEZONE, new Date().toISOString())
    .run();
}

async function userTimezone(env, userId) {
  const row = await env.DB.prepare("SELECT timezone FROM users WHERE user_id = ?").bind(userId).first();
  return row?.timezone || env.TIMEZONE;
}

async function isOnboarded(env, userId) {
  const row = await env.DB.prepare("SELECT onboarded FROM users WHERE user_id = ?").bind(userId).first();
  return row?.onboarded === 1;
}

function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---------- Reminders ----------

async function loadReminders(env, userId) {
  const { results } = await env.DB.prepare(
    "SELECT id, time, emoji, message FROM reminders WHERE user_id = ? ORDER BY time, id"
  )
    .bind(userId)
    .all();
  return results;
}

// What a check row stores about its reminder, so history keeps its label after edits or deletes.
// `slot` is "r<id>" for custom reminders, or an old default id ("morning", ...) from before.
async function reminderSnapshot(env, userId, slot) {
  if (slot.startsWith("r")) {
    const row = await env.DB.prepare("SELECT time, emoji, message FROM reminders WHERE id = ? AND user_id = ?")
      .bind(Number(slot.slice(1)), userId)
      .first();
    if (row) return row;
  }
  const old = DEFAULT_REMINDERS.find((d) => d.slot === slot);
  if (old) return old;
  return { time: null, emoji: "⏰", message: "Deleted reminder" };
}

function reminderListText(reminders, tz) {
  if (reminders.length === 0) return "You have no reminders.";
  const lines = reminders.map((r) => `${r.time} ${r.emoji} ${r.message}`);
  return `Your reminders (${tz}):\n${lines.join("\n")}`;
}

// Returns an error string, or null if the list is fine.
function validateReminders(list) {
  if (!Array.isArray(list)) return "reminders must be a list";
  if (list.length > MAX_REMINDERS) return `at most ${MAX_REMINDERS} reminders`;
  for (const r of list) {
    if (!TIME_RE.test(r?.time || "")) return `bad time "${r?.time}", use HH:MM on a 5-minute mark`;
    const emoji = String(r.emoji || "").trim();
    if (emoji.length > 16) return "emoji too long";
    const message = String(r.message || "").trim();
    if (message.length === 0) return "message is empty";
    if (message.length > 200) return "message is longer than 200 characters";
  }
  return null;
}

// Mini App save: the whole list is sent. Known ids are updated, new ones inserted, missing ones deleted.
// Ids are kept so today's already-sent questions still match their reminder.
async function handleSaveReminders(request, env, url) {
  const user = await miniAppUser(request, env);
  if (!user) {
    console.warn("save reminders: unauthorized");
    return Response.json({ error: "unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const list = body?.reminders;
  const error = validateReminders(list);
  if (error) {
    console.warn("save reminders: invalid", user.id, error);
    return Response.json({ error }, { status: 400 });
  }

  const existing = new Set((await loadReminders(env, user.id)).map((r) => r.id));
  const kept = new Set();
  const statements = [];
  for (const r of list) {
    const emoji = String(r.emoji || "").trim() || "⏰";
    const message = String(r.message).trim();
    if (existing.has(r.id) && !kept.has(r.id)) {
      kept.add(r.id);
      statements.push(
        env.DB.prepare("UPDATE reminders SET time = ?, emoji = ?, message = ? WHERE id = ? AND user_id = ?").bind(
          r.time, emoji, message, r.id, user.id
        )
      );
    } else {
      statements.push(
        env.DB.prepare("INSERT INTO reminders (user_id, time, emoji, message) VALUES (?, ?, ?, ?)").bind(
          user.id, r.time, emoji, message
        )
      );
    }
  }
  for (const id of existing) {
    if (!kept.has(id)) {
      statements.push(env.DB.prepare("DELETE FROM reminders WHERE id = ? AND user_id = ?").bind(id, user.id));
    }
  }
  const wasOnboarded = await isOnboarded(env, user.id);
  statements.push(env.DB.prepare("UPDATE users SET onboarded = 1 WHERE user_id = ?").bind(user.id));
  await env.DB.batch(statements);

  const reminders = await loadReminders(env, user.id);
  const tz = await userTimezone(env, user.id);
  console.log("reminders saved", { userId: user.id, count: reminders.length, firstTime: !wasOnboarded });

  await tg(env, "sendMessage", { chat_id: user.id, text: `⏰ Saved. ${reminderListText(reminders, tz)}` });
  if (!wasOnboarded) await sendWelcome(env, user.id, url.origin);

  return Response.json({ reminders });
}

// ---------- Telegram webhook ----------

async function handleWebhook(request, env, url) {
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== env.WEBHOOK_SECRET) {
    console.warn("webhook: bad secret");
    return new Response("Forbidden", { status: 403 });
  }

  const update = await request.json();
  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query, env, url);
    } else if (update.message) {
      await handleMessage(update.message, env, url);
    }
  } catch (err) {
    // Always answer 200, otherwise Telegram retries the same update forever.
    console.error("webhook error", err);
  }
  return new Response("ok");
}

async function handleCallback(query, env, url) {
  const userId = query.from.id;
  if (!(await isAllowed(env, userId))) {
    console.warn("callback from non-allowed user", userId);
    await tg(env, "answerCallbackQuery", { callback_query_id: query.id, text: "This bot is private." });
    return;
  }

  if (query.data.startsWith("setup|")) {
    await handleSetupChoice(query, env, url);
  } else {
    await handleAnswer(query, env);
  }
}

// Callback data: "date|slot|0or1". Late answers count for the asked day.
async function handleAnswer(query, env) {
  const userId = query.from.id;
  const [date, slot, sugarFlag] = query.data.split("|");
  const ateSugar = sugarFlag === "1";
  const snap = await reminderSnapshot(env, userId, slot);

  await env.DB.prepare(
    `INSERT INTO checks (user_id, date, slot, sugar, answered_at, time, emoji, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, date, slot) DO UPDATE SET sugar = excluded.sugar, answered_at = excluded.answered_at`
  )
    .bind(userId, date, slot, ateSugar ? 1 : 0, new Date().toISOString(), snap.time, snap.emoji, snap.message)
    .run();
  console.log("recorded answer", { userId, date, slot, ateSugar });

  const { stats } = await userStats(env, userId);
  const result = ateSugar ? "🍬 had sugar" : "✅ no sugar";
  const text = `${snap.emoji} ${snap.message}\n→ ${result} (${date})\n🔥 Streak: ${stats.streak} day(s)`;

  await tg(env, "answerCallbackQuery", { callback_query_id: query.id });
  await tg(env, "editMessageText", {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    text,
  });
}

// ---------- Onboarding: new users pick their reminders ----------

async function sendSetupChoice(env, userId, origin) {
  const defaults = DEFAULT_REMINDERS.map((r) => `${r.time} ${r.emoji}`).join(", ");
  await tg(env, "sendMessage", {
    chat_id: userId,
    text:
      "👋 Welcome! First, pick your reminders. At each one I ask if you ate sugar.\n\n" +
      `✅ Defaults: ${defaults}\n` +
      "✏️ Customize: your own times, emojis and messages\n" +
      "🔕 None: you only log moments yourself\n\n" +
      "You can change this any time with /reminders.",
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Use the defaults", callback_data: "setup|default" }],
        [{ text: "✏️ Customize", web_app: { url: `${origin}/?view=reminders` } }],
        [{ text: "🔕 No reminders", callback_data: "setup|none" }],
      ],
    },
  });
}

async function handleSetupChoice(query, env, url) {
  const userId = query.from.id;
  const choice = query.data.split("|")[1];

  const statements = [env.DB.prepare("UPDATE users SET onboarded = 1 WHERE user_id = ?").bind(userId)];
  // Don't add the defaults twice if the button is tapped again.
  const hasReminders = (await loadReminders(env, userId)).length > 0;
  if (choice === "default" && !hasReminders) {
    for (const r of DEFAULT_REMINDERS) {
      statements.push(
        env.DB.prepare("INSERT INTO reminders (user_id, time, emoji, message) VALUES (?, ?, ?, ?)").bind(
          userId, r.time, r.emoji, r.message
        )
      );
    }
  }
  await env.DB.batch(statements);
  console.log("setup choice", { userId, choice });

  const done = choice === "default" ? "✅ Using the default reminders." : "🔕 No reminders.";
  await tg(env, "answerCallbackQuery", { callback_query_id: query.id });
  await tg(env, "editMessageText", {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    text: `${done} Change them any time with /reminders.`,
  });
  await sendWelcome(env, userId, url.origin);
}

// ---------- Messages ----------

async function handleMessage(message, env, url) {
  const chatId = message.chat.id;
  const from = message.from;
  if (!from) return;

  // Private chats only: the bot messages users by their user id.
  if (message.chat.type !== "private") return;

  if (!(await isAllowed(env, from.id))) {
    console.log("message from non-allowed user", from.id);
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: `This bot is private. Your user id is ${from.id}. Send it to the owner to get access.`,
    });
    return;
  }

  await upsertUser(env, from);
  const text = message.text || "";

  const isOwnerCommand = /^\/(allow|remove|users)\b/.test(text);
  if (isOwnerCommand) {
    if (isOwner(env, from.id)) {
      await handleOwnerCommand(env, from.id, text);
    } else {
      await tg(env, "sendMessage", { chat_id: chatId, text: "Only the owner can do that." });
    }
    return;
  }

  if (text === BTN_REFUSED || text.startsWith("/refused")) {
    await logMoment(env, from.id, "refused");
    return;
  }
  if (text === BTN_SUGAR || text.startsWith("/sugar")) {
    await logMoment(env, from.id, "sugar");
    return;
  }
  if (text.startsWith("/undo")) {
    await undoMoment(env, from.id);
    return;
  }
  if (text.startsWith("/reminders")) {
    const reminders = await loadReminders(env, from.id);
    const tz = await userTimezone(env, from.id);
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: reminderListText(reminders, tz),
      reply_markup: {
        inline_keyboard: [[{ text: "✏️ Edit reminders", web_app: { url: `${url.origin}/?view=reminders` } }]],
      },
    });
    return;
  }
  if (text.startsWith("/widget")) {
    await sendWidgetScript(env, from.id, url.origin);
    return;
  }
  if (text.startsWith("/timezone")) {
    await setTimezone(env, from.id, text.split(/\s+/)[1]);
    return;
  }

  if (text.startsWith("/stats")) {
    const { stats } = await userStats(env, from.id);
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text:
        `🔥 Current streak: ${stats.streak}\n🏆 Best streak: ${stats.best}\n` +
        `✅ Clean days: ${stats.clean}\n🍬 Sugar days: ${stats.sugar}\n` +
        `💪 Times refused: ${stats.refused}`,
    });
    return;
  }

  // /start or anything else: new users pick their reminders first, others get the welcome.
  if (!(await isOnboarded(env, from.id))) {
    console.log("onboarding user", from.id);
    await sendSetupChoice(env, from.id, url.origin);
    return;
  }
  await sendWelcome(env, from.id, url.origin);
}

// The moment keyboard, the reminder list and the calendar button.
async function sendWelcome(env, userId, origin) {
  const reminders = await loadReminders(env, userId);
  const tz = await userTimezone(env, userId);
  await tg(env, "sendMessage", {
    chat_id: userId,
    text:
      `${reminderListText(reminders, tz)}\n\n` +
      "Any time, tap a button below to log a moment:\n" +
      `${BTN_REFUSED}: you said no to sugar\n` +
      `${BTN_SUGAR}: you had some\n\n` +
      "/reminders changes your reminders, /undo removes the last moment, /stats gives a summary, " +
      "/timezone Area/City changes your timezone, /widget gives an iPhone widget (Scriptable).",
    reply_markup: {
      keyboard: [[{ text: BTN_REFUSED }, { text: BTN_SUGAR }]],
      resize_keyboard: true,
      is_persistent: true,
    },
  });
  await tg(env, "sendMessage", {
    chat_id: userId,
    text: "Your calendar:",
    reply_markup: {
      inline_keyboard: [[{ text: "📅 Open calendar", web_app: { url: `${origin}/` } }]],
    },
  });
}

async function setTimezone(env, userId, tz) {
  if (!tz) {
    const current = await userTimezone(env, userId);
    await tg(env, "sendMessage", {
      chat_id: userId,
      text: `Your timezone is ${current}.\nChange it with e.g. /timezone Europe/London`,
    });
    return;
  }
  if (!isValidTimezone(tz)) {
    await tg(env, "sendMessage", {
      chat_id: userId,
      text: `"${tz}" is not a timezone I know. Use the Area/City form, e.g. Europe/Paris, America/New_York.`,
    });
    return;
  }

  await env.DB.prepare("UPDATE users SET timezone = ? WHERE user_id = ?").bind(tz, userId).run();
  console.log("timezone changed", { userId, tz });
  const { time } = localNow(Date.now(), tz);
  await tg(env, "sendMessage", {
    chat_id: userId,
    text: `🌍 Timezone set to ${tz} (it's ${time} there now).`,
  });
}

async function logMoment(env, userId, kind) {
  const tz = await userTimezone(env, userId);
  const { date, time } = localNow(Date.now(), tz);
  await env.DB.prepare("INSERT INTO moments (user_id, date, time, kind, created) VALUES (?, ?, ?, ?, ?)")
    .bind(userId, date, time, kind, new Date().toISOString())
    .run();
  console.log("logged moment", { userId, date, time, kind });

  const { stats } = await userStats(env, userId);
  const text =
    kind === "refused"
      ? `💪 Nice, logged at ${time}. You've refused sugar ${stats.refused} time(s).\n🔥 Streak: ${stats.streak} day(s)`
      : `🍬 Logged at ${time}. Today counts as a sugar day. Tomorrow starts a new streak.`;
  await tg(env, "sendMessage", { chat_id: userId, text });
}

async function undoMoment(env, userId) {
  const last = await env.DB.prepare(
    "SELECT id, date, time, kind FROM moments WHERE user_id = ? ORDER BY id DESC LIMIT 1"
  )
    .bind(userId)
    .first();
  if (!last) {
    await tg(env, "sendMessage", { chat_id: userId, text: "Nothing to undo." });
    return;
  }
  await env.DB.prepare("DELETE FROM moments WHERE id = ? AND user_id = ?").bind(last.id, userId).run();
  console.log("undid moment", { userId, ...last });

  const label = last.kind === "refused" ? BTN_REFUSED : BTN_SUGAR;
  await tg(env, "sendMessage", {
    chat_id: userId,
    text: `↩️ Removed: ${label} (${last.date} ${last.time})`,
  });
}

async function sendQuestion(env, reminder, date) {
  await tg(env, "sendMessage", {
    chat_id: reminder.user_id,
    text: `${reminder.emoji} ${reminder.message}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ No sugar", callback_data: `${date}|r${reminder.id}|0` },
          { text: "🍬 I had sugar", callback_data: `${date}|r${reminder.id}|1` },
        ],
      ],
    },
  });
}

async function tg(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  // e.g. 403 when a user blocked the bot. Logged, never thrown.
  if (!data.ok) console.error("telegram error", method, body.chat_id, data);
  return data;
}

// ---------- Mini App API ----------

// The Telegram user behind a Mini App request, or null if not valid or not allowed.
async function miniAppUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const initData = auth.startsWith("tma ") ? auth.slice(4) : "";
  const user = await checkInitData(initData, env.BOT_TOKEN);
  if (!user || !(await isAllowed(env, user.id))) return null;
  return user;
}

async function handleStats(request, env) {
  const user = await miniAppUser(request, env);
  if (!user) {
    console.warn("stats: unauthorized");
    return Response.json({ error: "unauthorized" }, { status: 403 });
  }

  const { days, today, reminders, stats } = await userStats(env, user.id);

  const calendar = {};
  for (const [date, day] of Object.entries(days)) {
    calendar[date] = { status: dayStatus(day), checks: day.checks, moments: day.moments };
  }

  return Response.json({ today, reminders, calendar, ...stats });
}

// Telegram Mini App initData check:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function checkInitData(initData, botToken) {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
  const signature = toHex(await hmacSha256(secretKey, dataCheckString));
  if (signature !== hash) return null;

  const ageSeconds = Date.now() / 1000 - Number(params.get("auth_date"));
  if (ageSeconds > 24 * 3600) return null;

  return JSON.parse(params.get("user") || "null");
}

async function hmacSha256(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- iOS widget (Scriptable) ----------
// The widget can't use Mini App initData (expires after 24h), so it uses a long-lived token:
// "<userId>.<hmac(BOT_TOKEN, 'widget:<userId>')>". No table needed.
// Revoke one user: /remove. Revoke all tokens: change BOT_TOKEN.

async function widgetToken(env, userId) {
  const sig = await hmacSha256(new TextEncoder().encode(env.BOT_TOKEN), `widget:${userId}`);
  return `${userId}.${toHex(sig).slice(0, 32)}`;
}

async function checkWidgetToken(env, token) {
  const userId = Number(token.split(".")[0]);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const expected = new TextEncoder().encode(await widgetToken(env, userId));
  const given = new TextEncoder().encode(token);
  if (expected.length !== given.length) return null;
  if (!crypto.subtle.timingSafeEqual(expected, given)) return null;
  return userId;
}

async function handleWidget(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const userId = await checkWidgetToken(env, token);

  if (!userId || !(await isAllowed(env, userId))) {
    console.warn("widget: unauthorized", userId);
    return Response.json({ error: "unauthorized" }, { status: 403 });
  }

  const { days, today, stats } = await userStats(env, userId);

  // Last 7 days, oldest first, today last.
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const date = shiftDay(today, -i);
    week.push({ date, status: dayStatus(days[date]) });
  }
  const refusedToday = (days[today]?.moments || []).filter((m) => m.kind === "refused").length;

  return Response.json({ today, todayStatus: dayStatus(days[today]), refusedToday, week, ...stats });
}

async function sendWidgetScript(env, userId, origin) {
  const token = await widgetToken(env, userId);
  const me = await tg(env, "getMe", {});
  const botUrl = `https://t.me/${me.result?.username || ""}`;
  const script = WIDGET_SCRIPT.replace("__API__", `${origin}/api/widget`)
    .replace("__TOKEN__", token)
    .replace("__BOT__", botUrl);
  console.log("sent widget script", userId);

  await tg(env, "sendMessage", {
    chat_id: userId,
    text:
      "📱 iPhone widget with Scriptable:\n" +
      "1. Copy the script in the next message (tap it).\n" +
      "2. In Scriptable, tap +, paste, name it \"No Sugar\".\n" +
      "3. On the home screen, add a small Scriptable widget.\n" +
      "4. Long-press it → Edit Widget → Script: No Sugar.\n\n" +
      "🔒 The script holds your personal token. Anyone with it can see your stats, so don't share it.",
  });
  await tg(env, "sendMessage", {
    chat_id: userId,
    text: `<pre><code class="language-javascript">${escapeHtml(script)}</code></pre>`,
    parse_mode: "HTML",
  });
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Scriptable script. Plain string, no template literals inside.
const WIDGET_SCRIPT = `// No Sugar widget. Get a fresh copy with /widget in the bot.
const API = "__API__";
const TOKEN = "__TOKEN__";
const BOT = "__BOT__";

const C = {
  bg: Color.dynamic(new Color("#ffffff"), new Color("#1c1c1e")),
  text: Color.dynamic(new Color("#000000"), new Color("#ffffff")),
  dim: new Color("#8e8e93"),
  clean: new Color("#1a7f52"),
  sugar: new Color("#f6c7b8"),
  none: Color.dynamic(new Color("#e5e5ea"), new Color("#3a3a3c")),
};

const widget = new ListWidget();
widget.backgroundColor = C.bg;
widget.url = BOT;
widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

try {
  const req = new Request(API);
  req.headers = { Authorization: "Bearer " + TOKEN };
  const data = await req.loadJSON();
  if (data.error) throw new Error(data.error);
  draw(data);
} catch (e) {
  const t = widget.addText("No Sugar\\n" + e.message);
  t.font = Font.systemFont(12);
  t.textColor = C.dim;
}

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentSmall();
Script.complete();

function draw(d) {
  const top = widget.addStack();
  top.centerAlignContent();
  const flame = top.addText("🔥");
  flame.font = Font.systemFont(22);
  top.addSpacer(4);
  const num = top.addText(String(d.streak));
  num.font = Font.boldRoundedSystemFont(36);
  num.textColor = C.text;

  const label = widget.addText(d.streak === 1 ? "day without sugar" : "days without sugar");
  label.font = Font.mediumSystemFont(12);
  label.textColor = C.dim;

  widget.addSpacer();

  const row = widget.addStack();
  for (let i = 0; i < d.week.length; i++) {
    const day = d.week[i];
    const dot = row.addStack();
    dot.size = new Size(14, 14);
    dot.cornerRadius = 7;
    dot.backgroundColor = C[day.status] || C.none;
    if (day.date === d.today) {
      dot.borderWidth = 2;
      dot.borderColor = C.text;
    }
    if (i < d.week.length - 1) row.addSpacer(5);
  }

  widget.addSpacer(8);

  const status = {
    clean: "✅ Clean today",
    sugar: "🍬 Sugar today",
    none: "Nothing logged today",
  }[d.todayStatus];
  const line = widget.addText(status + (d.refusedToday ? "  💪" + d.refusedToday : ""));
  line.font = Font.mediumSystemFont(11);
  line.textColor = C.text;

  const best = widget.addText("🏆 Best " + d.best);
  best.font = Font.systemFont(11);
  best.textColor = C.dim;
}
`;

// ---------- Stats ----------

// Everything needed to show a user's stats. Users with no reminders get the "gray day" rule.
async function userStats(env, userId) {
  const [days, tz, reminders] = await Promise.all([
    loadDays(env, userId),
    userTimezone(env, userId),
    loadReminders(env, userId),
  ]);
  const today = localNow(Date.now(), tz).date;
  const stats = computeStats(days, today, reminders.length === 0);
  return { days, today, tz, reminders, stats };
}

// Returns { "2026-11-13": { checks: [{ slot, sugar, time, emoji, message }], moments: [{ time, kind }] }, ... }
async function loadDays(env, userId) {
  const [checks, moments] = await env.DB.batch([
    env.DB.prepare(
      "SELECT date, slot, sugar, time, emoji, message FROM checks WHERE user_id = ? ORDER BY date, time"
    ).bind(userId),
    env.DB.prepare("SELECT date, time, kind FROM moments WHERE user_id = ? ORDER BY date, time, id").bind(userId),
  ]);

  const days = {};
  const dayFor = (date) => (days[date] ??= { checks: [], moments: [] });
  for (const row of checks.results) {
    const { date, ...check } = row;
    dayFor(date).checks.push(check);
  }
  for (const row of moments.results) {
    dayFor(row.date).moments.push({ time: row.time, kind: row.kind });
  }
  return days;
}

// A day is "sugar" if any check said yes or a sugar moment was logged,
// "clean" if it has any record and no sugar, "none" if nothing was logged.
function dayStatus(day) {
  if (!day) return "none";
  const hasRecord = day.checks.length > 0 || day.moments.length > 0;
  if (!hasRecord) return "none";

  const sugarCheck = day.checks.some((c) => c.sugar === 1);
  const sugarMoment = day.moments.some((m) => m.kind === "sugar");
  return sugarCheck || sugarMoment ? "sugar" : "clean";
}

// emptyIsGray: for users with no reminders, a day with nothing logged is a gray day.
// It does not count as clean and does not break the streak. Otherwise an empty past day breaks it.
// Today with nothing logged never breaks the streak.
function computeStats(days, today, emptyIsGray) {
  let clean = 0;
  let sugar = 0;
  let refused = 0;
  for (const day of Object.values(days)) {
    if (dayStatus(day) === "clean") clean++;
    else sugar++;
    refused += day.moments.filter((m) => m.kind === "refused").length;
  }

  const dates = Object.keys(days).sort();
  const first = dates[0];
  if (!first) return { streak: 0, best: 0, clean, sugar, refused };

  // Best streak: walk every day from the first record to today.
  let best = 0;
  let run = 0;
  for (let d = first; d <= today; d = shiftDay(d, 1)) {
    const status = dayStatus(days[d]);
    if (status === "clean") {
      run++;
      best = Math.max(best, run);
    } else if (status === "sugar" || !emptyIsGray) {
      run = 0;
    }
  }

  // Current streak: walk back from today until a day breaks it.
  let streak = 0;
  for (let d = today; d >= first; d = shiftDay(d, -1)) {
    const status = dayStatus(days[d]);
    if (status === "clean") streak++;
    else if (status === "sugar") break;
    else if (d !== today && !emptyIsGray) break;
  }

  return { streak, best, clean, sugar, refused };
}

// ---------- Dates ----------

function localNow(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

function shiftDay(date, delta) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
