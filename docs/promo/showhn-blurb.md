# Show HN blurb (+ Product Hunt tagline)

## Show HN title

Show HN: Civitas – open-source Discord leadership system (ranked-choice elections, mandates, succession)

## Show HN body

Hi HN! I built Civitas (MIT) because electing community mods through
strawpolls felt broken. It's a Discord bot covering the full leadership
lifecycle: positions → applications → elections (majority/approval/ranked-choice
with real IRV counting) → mandates with probation → succession when leaders
leave. Anonymous ballots are structurally separated from voter receipts so
choices can't be casually reconstructed. Stack: TypeScript, discord.js,
Supabase Postgres, Prisma. Runs on free hosting; guided /tutorial gets a
server from zero to first election in 5 minutes.

Repo: https://github.com/DevLJSP/civitas
Demo: <LINK_60S_VIDEO>

Technical bits I'd love feedback on: deterministic tie-breaking vs random
ballots, and receipt-table anonymity vs full cryptographic approaches.

## Product Hunt tagline (60 chars)

Open-source Discord leadership: elections, mandates, succession
