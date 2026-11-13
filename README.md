# No Sugar bot

A private Telegram bot that helps you quit sugar.

- Asks 4×/day (10:00, 12:30, 16:00, 19:00, in your timezone): *did you eat sugar since the last check?*
- Log moments any time with one tap: **💪 Refused sugar** or **🍬 Had sugar**.
- A calendar Mini App inside Telegram shows your streak, best streak, clean/sugar days and refusals.
- Multi-user with an allowlist: the owner decides who can use it.

Runs on one Cloudflare Worker + D1. Free tier is plenty.

## How it works

One Worker (`src/index.js`) does everything:

| Part | What it does |
| --- | --- |
| `scheduled` (cron every 30 min) | For each allowed user, sends a question when *their* local time matches a slot. DST-safe. |
| `POST /webhook` | Telegram updates: answer buttons, moments, commands. Checked with a secret header. |
| `GET /api/stats` | Calendar data for the Mini App. Checked with Telegram `initData` (HMAC). |
| `/` | The Mini App page (`public/index.html`). |

Data lives in D1: `users`, `allowlist`, `checks` (one row per user/day/slot), `moments`. See `schema.sql`.

## Commands

| Command | Who | |
| --- | --- | --- |
| `/start` | everyone | Shows the moment buttons and calendar button |
| `/refused`, `/sugar` | everyone | Log a moment (same as the buttons) |
| `/undo` | everyone | Remove your last moment |
| `/stats` | everyone | Streak and counts as text |
| `/timezone Area/City` | everyone | Show or change your timezone (default `Europe/Paris`) |
| `/allow <id>` | owner | Give someone access |
| `/remove <id>` | owner | Remove access, stop reminders. Their data is kept |
| `/users` | owner | List allowed users |

## Rules

- A day is **sugar** if any check said yes or a sugar moment was logged.
- A day is **clean** if it has any record and no sugar. **Empty** if nothing logged.
- Streak = consecutive clean days. Today with nothing logged yet does not break it; an empty past day does.
- Refusals count as wins and show as a dot on the calendar.

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

## Upgrading from the single-user version

```sh
cf d1 query <database_id> --sql "$(grep -v '^\s*--' migrate-multi-user.sql | sed 's/__OWNER_ID__/<your id>/g')"
npm run deploy
```
