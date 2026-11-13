# CLAUDE.md

Telegram bot to track sugar. One Cloudflare Worker + D1 + a static Mini App page. Plain JS, no framework, no bot library.

## Files

- `src/index.js` — the whole Worker: cron, webhook, `/api/stats`, stats logic. Telegram API called with plain `fetch` (`tg()`).
- `public/index.html` — Mini App (design "A · Telegram native"). Vanilla JS, uses Telegram `--tg-theme-*` CSS vars.
- `schema.sql` — fresh-install schema. `migrate-multi-user.sql` — one-time upgrade from single-user (already applied in prod).
- `cloudflare.config.ts` — Worker config for `cf` (name, entrypoint, `env` bindings, cron). `wrangler.config.ts` only sets `assetsDirectory`.
- `.secrets.env` (prod secrets) and `.dev.vars` (fake local secrets) are git-ignored. Never print or commit their values.

## Commands

- Deploy: `cf deploy --secrets-file .secrets.env`
- Local: `npm run dev` (`cf dev`, port 8787). `wrangler dev` does NOT read `cloudflare.config.ts`; use `cf dev`.
- SQL on prod: `cf d1 query <db_id> --sql "..."` (`cf d1 list` for the id). Strip `--` comment lines first: `cf` parses them as flags.
- Local D1 file: `.cloudflare/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite` (not the observability `.sqlite`).
- Logs: `cf` observability is enabled in config.
- `cf` discovery: `cf cli search "<task>"`, then `<command> --help`.

## Rules that matter

- Config key for bindings is `env:` (not `bindings:`) with this wrangler version.
- Time: cron runs every 30 min UTC; each user's slot is matched in their own timezone (`users.timezone`). Use `controller.scheduledTime`, not `Date.now()`, in `scheduled`.
- Dates stored as the user's local `YYYY-MM-DD`. Callback data is `date|slot|0or1`, so late answers count for the asked day.
- Access: owner = `OWNER_ID` secret, always allowed. Others via `allowlist` table, managed with `/allow`, `/remove`, `/users` (owner only). Every query must filter by `user_id`.
- Webhook always returns 200 (else Telegram retries forever); errors are logged.
- Mini App auth: `Authorization: tma <initData>`, verified with HMAC per Telegram docs, max age 24h.
- Owner-only commands are shown only in the owner's command menu (`setMyCommands` with chat scope).

## Testing

No test framework. Integration-test against `cf dev`: POST fake updates to `/webhook`, forge valid `initData` with the fake token (node `crypto` HMAC), check `/api/stats` and the local sqlite file. Verify before deploy.
