# CLAUDE.md

Telegram bot to track sugar. One Cloudflare Worker + D1 + a static Mini App page. Plain JS, no framework, no bot library.

## Files

- `src/index.js` — the whole Worker: cron, webhook, `/api/stats`, stats logic. Telegram API called with plain `fetch` (`tg()`).
- `public/index.html` — Mini App (design "A · Telegram native"). Vanilla JS, uses Telegram `--tg-theme-*` CSS vars.
- `schema.sql` — fresh-install schema. `migrate-*.sql` — one-time upgrades (`migrate-multi-user.sql` already applied in prod).
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
- Time: cron runs every 5 min UTC; each reminder (`reminders` table) is matched in its user's timezone (`users.timezone`). Times must be HH:MM on a 5-minute mark. Use `controller.scheduledTime`, not `Date.now()`, in `scheduled`.
- Reminders: each user has their own (time, emoji, message), max 12. New users pick defaults / custom (Mini App `?view=reminders`) / none; `users.onboarded` marks it done.
- With no reminders, an empty day is gray: not clean, doesn't break the streak (`computeStats` `emptyIsGray`).
- Dates stored as the user's local `YYYY-MM-DD`. Callback data is `date|slot|0or1` (`slot` = `r<reminder id>`, or old `morning|lunch|break|dinner`), so late answers count for the asked day. Checks store a copy of the reminder's time/emoji/message.
- Access: owner = `OWNER_ID` secret, always allowed. Others via `allowlist` table, managed with `/allow`, `/remove`, `/users` (owner only). Every query must filter by `user_id`.
- Webhook always returns 200 (else Telegram retries forever); errors are logged.
- Mini App auth: `Authorization: tma <initData>`, verified with HMAC per Telegram docs, max age 24h.
- Owner-only commands are shown only in the owner's command menu (`setMyCommands` with chat scope).

## Workflow for every feature or patch

1. Branch from `main` (`feat/...` or `fix/...`), make the change, test locally (see Testing).
2. Commit, push, open a PR with `gh pr create`.
3. Run `/code-review high` on the PR.
4. Findings:
   - Easy, clear fix (bug, typo, missing check): fix it, push, no need to ask.
   - Product decision (behavior, UX, wording, data, scope): stop and ask the user.
5. Show the user the PR link and wait for their approval. Never merge without it.
6. Once approved: `gh pr merge --squash --delete-branch`, then `git checkout main && git pull`.
7. Release: `gh release create vX.Y.Z --generate-notes` (patch = fix, minor = feature). This deploys via GitHub Actions. Watch it with `gh run watch` and report the result.
8. If the change needs new SQL, run it on prod with `cf d1 query` before the release.

## Testing

No test framework. Local cron: `curl "localhost:8787/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*&time=<epoch ms>"`. Integration-test against `cf dev`: POST fake updates to `/webhook`, forge valid `initData` with the fake token (node `crypto` HMAC), check `/api/stats` and the local sqlite file. Verify before deploy.
