# Implementation plan: top.gg vote webhook → voter rewards

Goal: when someone votes for Civitas on top.gg, thank them and grant a Voter
role in the support server. This closes the install → community loop and is
the highest-leverage organic growth feature available.

## Constraints (do not violate)

- The bot is a single Discord process on free hosting (300MB RAM). No new
  always-on services, no Redis.
- The webhook endpoint must authenticate top.gg (`Authorization` header =
  webhook secret), rate-limit, and never trust the body blindly.
- Guild isolation still applies: votes map to the support guild only.

## Design

1. **Transport**: minimal HTTP listener inside the bot process (Node built-in
   `http`, NOT express — zero new heavy deps) on `PORT` (default 3000),
   single route `POST /webhooks/topgg`. Only binds when `TOPGG_WEBHOOK_SECRET`
   is set; otherwise the bot runs exactly as today.
2. **Verification**: constant-time compare of `req.headers.authorization`
   against the secret (`crypto.timingSafeEqual`; reuse `safeEqual` in
   `src/utils/crypto.ts`). Reject missing/invalid with 401, log attempts.
3. **Payload**: top.gg sends `{ user, type }` (`type: "upvote" | "test"`).
   Validate with zod: `user` = Discord snowflake string, `type` enum.
   Respond 200 fast, process async (never hold the webhook).
4. **Storage**: new `TopggVote` table (`userId` PK-ish, `votedAt`,
   `remindedAt?`, `rewardedAt?`). Upsert per vote = idempotent retries +
   weekend-double-vote detection (top.gg allows re-vote every 12h).
5. **Reward**: `rewardService` grants the configured Voter role in the support
   guild via existing `safeAddRole` (hierarchy checks included), then DMs a
   thank-you (catch closed DMs silently). All steps idempotent.
6. **Config**: `GuildConfig` gains `voterRoleId` + `supportGuildId`-style
   fields (or a tiny `VoteRewardConfig`); `/setup` gets a `rewards` subcommand
   to set them. Secrets: `TOPGG_WEBHOOK_SECRET` in `.env` + `.env.example`.
7. **Ops**: document the public URL + secret setup on top.gg's webhook page;
   note free hosts without inbound ports (Pterodactyl panels usually expose
   none) — fallback documented: skip real-time rewards, run an hourly
   `ScheduledTask` that polls top.gg's "has voted" API instead.

## Files to add/change (when built)

- `prisma/schema.prisma`: `TopggVote` + config fields → migration `0004`
- `src/services/voteRewardService.ts` (new): verify → store → reward
- `src/jobs/httpServer.ts` (new): tiny listener, started from `index.ts`
  only when configured
- `src/commands/setup.ts`: `rewards` subcommand
- `tests/vote-reward.test.ts`: auth reject/accept, idempotent upsert,
  double-vote window, DM-closed resilience (mocked)
- `.env.example`, README (webhook setup section)

## Verification

Unit tests green, `tsc` clean, manual: top.gg "test" webhook → 200 → role
granted → repeat delivery → no duplicate role/DM. Rollback: unset the secret
and redeploy; bot behavior unchanged.
