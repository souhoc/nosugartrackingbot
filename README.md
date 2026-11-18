# No Sugar bot

A private Telegram bot that helps you quit sugar.

- Asks *did you eat sugar?* at your own reminders: time, emoji and message are yours (up to 12, or none). New users pick defaults, custom or none.
- Log moments any time with one tap: **💪 Refused sugar** or **🍬 Had sugar**.
- A calendar Mini App inside Telegram shows your streak, best streak, clean/sugar days and refusals.
- Set a **target** (clean days) and see the days left, in the Mini App and on the iPhone widget. Reaching it earns **🍀 cheat days**: use one on a sugar day and your streak survives.
- Multi-user with an allowlist: the owner decides who can use it.

Runs on one Cloudflare Worker + D1. Free tier is plenty.

## How it works

One Worker (`src/index.js`) does everything:

| Part | What it does |
| --- | --- |
| `scheduled` (cron every 5 min) | Sends each reminder whose time matches its user's local time. Follows DST, but a reminder inside the skipped/repeated hour (often 02:00–03:00) is skipped or sent twice on those 2 days. |
| `POST /webhook` | Telegram updates: answer buttons, moments, commands. Checked with a secret header. |
| `GET /api/stats` | Calendar data for the Mini App. Checked with Telegram `initData` (HMAC). |
| `PUT /api/reminders` | Save the user's reminders from the Mini App. Same `initData` check. |
| `PUT /api/target` | Set, replace or remove the target from the Mini App. Same `initData` check. |
| `PUT /api/cheat` | Use a cheat day on a sugar day. Same `initData` check. |
| `GET /api/widget` | Data for the iPhone widget. Checked with a per-user token. |
| `/` | The Mini App page (`public/index.html`). |

Data lives in D1: `users`, `allowlist`, `reminders`, `checks` (one row per user/day/reminder, with a copy of the reminder text), `moments`, `targets`, `cheats`. See `schema.sql`.

## Commands

| Command | Who | |
| --- | --- | --- |
| `/start` | everyone | First time: pick reminders. Then: moment buttons and calendar button |
| `/reminders` | everyone | List reminders, button to edit them in the Mini App |
| `/refused`, `/sugar` | everyone | Log a moment (same as the buttons) |
| `/undo` | everyone | Remove your last moment |
| `/stats` | everyone | Streak and counts as text |
| `/timezone Area/City` | everyone | Show or change your timezone (default `Europe/Paris`) |
| `/widget` | everyone | Get an iPhone home screen widget script for [Scriptable](https://scriptable.app) |
| `/allow <id>` | owner | Give someone access |
| `/remove <id>` | owner | Remove access, stop reminders. Their data is kept |
| `/users` | owner | List allowed users |
| `/broadcast <text>` | owner | Send a message to every allowed user and yourself (line breaks kept) |

## Rules

- A day is **sugar** if any check said yes or a sugar moment was logged.
- A day is **clean** if it has any record (answer or moment) and no sugar.
- A day with nothing logged is **gray**: it doesn't count as clean and doesn't break the streak.
- Streak = clean days in a row, skipping gray days. Only a sugar day breaks it.
- Refusals count as wins and show as a dot on the calendar.

### Targets and cheat days

- A target is a number of clean days, 7 to 365. One at a time. Progress follows the streak rules: gray days are skipped, a sugar day sends it back to 0.
- When setting it, choose **count my current streak** (reached sooner) or **start from today**.
- Reward: `floor(new days / 7) + floor(new days / 30)` cheat days, e.g. 7 → 1, 14 → 2, 30 → 5, 90 → 15. With the streak counted, only the days still to go count as new: a 30-day target on a 20-day streak pays for 10. That also means a counted streak needs at least 7 new days.
- The bot sends a message when a target is reached. It's then done: set a new one if you want.
- Balance is capped at 15. Anything above is lost (the message says how many).
- Use a cheat day on a sugar day from the calendar (asks to confirm). That day then acts like a gray day: it doesn't break the streak or count in it. It still counts in "sugar days". After logging sugar, the bot offers the button if you have cheat days.
- No undo button. The cheat day only comes back if its day stops being a sugar day (`/undo` of the sugar, or the answer changed to clean).
- Progress only counts from the target's start (first day of the counted streak, or the day it was set). A cheat day on an older sugar day doesn't add progress.

## Deploy your own

You need: a Cloudflare account, the [`cf` CLI](https://developers.cloudflare.com/cf/) logged in, Node 22.18+.

1. **Create the bot**: in Telegram, `/newbot` with [@BotFather]. Keep the token.
2. **Get your user id**: message [@userinfobot].
3. **Secrets file** (git-ignored):

   ```sh
   cat > .secrets.env <<'X'
   BOT_TOKEN=<from @BotFather>
   WEBHOOK_SECRET=<output of: openssl rand -hex 16>
   OWNER_ID=<your user id>
   X
   ```

4. **Deploy** (creates the D1 database on first run):

   ```sh
   npm install
   npm run deploy    # cf deploy --secrets-file .secrets.env; note the workers.dev URL
   ```

5. **Create tables** (database id from `cf d1 list`). Comment lines are stripped because `cf` reads `--` as a flag:

   ```sh
   cf d1 query <database_id> --sql "$(grep -v '^\s*--' schema.sql)"
   ```

6. **Connect Telegram** (load secrets with `set -a; . ./.secrets.env; set +a`):

   ```sh
   URL=https://no-sugar.<you>.workers.dev

   curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
     -d url=$URL/webhook -d secret_token=$WEBHOOK_SECRET

   # Calendar button next to the chat input
   curl "https://api.telegram.org/bot$BOT_TOKEN/setChatMenuButton" -H 'content-type: application/json' \
     -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Calendar\",\"web_app\":{\"url\":\"$URL/\"}}}"

   # Command menu ("/" list). Everyone gets USER_CMDS; the owner gets USER_CMDS + OWNER_CMDS.
   # A chat scope replaces the default list, so the owner list repeats USER_CMDS.
   # Re-run after any change to commands or descriptions (keep in sync with the Commands table).
   # Each call must print {"ok":true,"result":true}.
   USER_CMDS='{"command":"refused","description":"I refused sugar"},
     {"command":"sugar","description":"I had sugar"},
     {"command":"undo","description":"Remove the last moment"},
     {"command":"reminders","description":"Your reminders: list and edit"},
     {"command":"stats","description":"Streak and counts"},
     {"command":"timezone","description":"Show or change your timezone"},
     {"command":"widget","description":"iPhone home screen widget (Scriptable)"},
     {"command":"start","description":"Show buttons and calendar"}'
   OWNER_CMDS='{"command":"allow","description":"Owner: /allow <user id>"},
     {"command":"remove","description":"Owner: /remove <user id>"},
     {"command":"users","description":"Owner: list allowed users"},
     {"command":"broadcast","description":"Owner: /broadcast <text> to all users"}'

   curl "https://api.telegram.org/bot$BOT_TOKEN/setMyCommands" -H 'content-type: application/json' \
     -d "{\"commands\":[$USER_CMDS]}"
   curl "https://api.telegram.org/bot$BOT_TOKEN/setMyCommands" -H 'content-type: application/json' \
     -d "{\"scope\":{\"type\":\"chat\",\"chat_id\":$OWNER_ID},\"commands\":[$USER_CMDS,$OWNER_CMDS]}"
   ```

7. Send `/start` to your bot.

[@BotFather]: https://t.me/BotFather
[@userinfobot]: https://t.me/userinfobot

## Sharing with someone

1. They open the bot and send anything. It replies with their user id.
2. They send you the id. You send `/allow <id>` to the bot.
3. They get "You now have access" and send `/start`.

## Local dev

```sh
cat > .dev.vars <<'X'
BOT_TOKEN=123456:TEST_TOKEN
WEBHOOK_SECRET=testsecret
OWNER_ID=42
X
npm run dev    # cf dev, local D1, http://localhost:8787
```

Telegram calls fail with the fake token (logged as `telegram error`), but the database and `/api/stats` work.
Simulate updates by POSTing to `/webhook` with header `X-Telegram-Bot-Api-Secret-Token: testsecret`.

## Upgrading

Adding targets and cheat days (new tables only, run before deploying that version). Then send `/widget` again to get the widget script that shows the target:

```sh
cf d1 query <database_id> --sql "$(grep -v '^\s*--' migrate-targets.sql)"
```

From fixed 4 slots to custom reminders (run before deploying that version):

```sh
cf d1 query <database_id> --sql "$(grep -v '^\s*--' migrate-reminders.sql)"
```

From the single-user version:

```sh
cf d1 query <database_id> --sql "$(grep -v '^\s*--' migrate-multi-user.sql | sed 's/__OWNER_ID__/<your id>/g')"
npm run deploy
```
