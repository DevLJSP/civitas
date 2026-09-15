# r/Discord_Bots showcase post

Title: **I built an open-source leadership system for Discord — elections with ranked-choice voting, mandates, probation, succession (MIT)**

Body:

Hey all! I run communities and got tired of electing mods through strawpolls
and chaotic DMs, so I built **Civitas** — a free, open-source bot that manages
the whole leadership lifecycle inside Discord:

- Create positions (Mod, Captain, Council…) with seats, terms, eligibility
- Members apply through private forms, staff approve with buttons
- Run **real elections: majority, approval, or ranked-choice** (proper IRV
  elimination rounds, quorum, anonymous mode)
- Winners automatically get the Discord role + a mandate with optional probation
- Resignations/removals trigger **succession** automatically — no leaderless teams
- Plus impeachment votes, community proposals, promotions, audit log, stats

New servers get a guided `/tutorial` that creates a first position and a test
election in ~5 minutes. Everything stays in Discord — no external dashboard.

Stack: Node.js + TypeScript + discord.js + Supabase Postgres + Prisma.
Hosted free, code is MIT: https://github.com/DevLJSP/civitas

Demo video: <LINK_60S_VIDEO>

Happy to answer anything — especially about the ranked-choice counting, that
was the fun part. What governance headaches does your server have?
