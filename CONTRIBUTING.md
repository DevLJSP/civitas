# Contributing to Civitas

Thanks for helping! This guide keeps contributions smooth and safe.

## Setup

```bash
git clone <repo-url> civitas
cd civitas
npm install          # Node 20+ (see .nvmrc)
cp .env.example .env # fill in your own dev bot + database
npx prisma generate
npx prisma migrate dev --name <change>
npm run deploy:commands  # use GUILD_ID for instant guild refresh while developing
npm run dev
```

You need a Discord test application and a Postgres database (Supabase free
tier works). Never use production credentials for development.

## Ground rules

- **No secrets in code, issues, or PRs.** No tokens, connection strings, or
  real user data. `.env` is gitignored — keep it that way.
- **Guild isolation is load-bearing.** Every new query on guild-owned data
  must scope by `guildId` and go through the guarded repositories.
- **Anonymous voting stays anonymous.** Do not add voter↔choice links to
  ballots, results, logs, or audit entries.
- **Business logic lives in services**, not in command handlers. Pure
  functions (election engine, guards, state machines) must come with tests.
- Keep files small, TypeScript strict, and avoid `any`.

## Pull requests

1. Branch from `main`: `feat/...`, `fix/...`, `docs/...`.
2. Run the gates: `npx tsc --noEmit`, `npm run build`, `npm test`.
3. If you changed the schema: include the Prisma migration and verify
   `npx prisma validate`.
4. Fill in the PR template. One failed interaction must never crash the bot —
   say how you verified error paths.

## Release process (maintainers)

- `main` is always deployable. Tag releases `vX.Y.Z` with GitHub Release notes.
- DB migrations are additive. Discloud runs `npm run build` then `npm start`;
  apply `prisma migrate deploy` before starting new code that needs it.
