## What & why

## How to test

```bash
npm install
npx prisma generate
npm run build
npm test
```

## Checklist

- [ ] `npx tsc --noEmit` clean
- [ ] `npm test` green (new behavior has tests)
- [ ] No secrets, tokens, or real user data anywhere in the diff
- [ ] Guild isolation preserved (new queries scope by `guildId`)
- [ ] Anonymous voting untouched (no voter↔choice links added)
- [ ] Schema change? Migration included + `prisma validate` passes
- [ ] Error paths return friendly messages, never stack traces
