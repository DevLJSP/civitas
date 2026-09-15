# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Instead, report privately to the repository maintainers (see the repository's
contact options — e.g. a private security advisory on GitHub). Include:

- affected version / commit
- steps to reproduce (without real tokens or production data)
- impact assessment if known

We aim to acknowledge reports within 72 hours and will coordinate a fix and
disclosure timeline with you.

## Security model notes for operators

- The bot connects to PostgreSQL with a single privileged `DATABASE_URL`.
  Application-level guild isolation is enforced in code (`assertSameGuild` on
  every guild-owned read/write). Never expose `DATABASE_URL` to clients.
- Anonymous elections store ballots with `voterId = NULL`; voter identity
  lives only in the receipt table used for duplicate prevention. Audit logs
  must never include per-voter choices — contributions must preserve this.
- Discord component IDs (`civitas:<ns>:<action>:<id>`) are untrusted input:
  the authoritative guild is always `interaction.guildId`.
- If you expose this database through Supabase PostgREST, enable Row Level
  Security on all tables (see README). The bot itself is unaffected by RLS
  when connecting as a privileged role.
- Never paste tokens, connection strings, or message contents containing
  secrets into issues, logs, or PRs. The bot redacts `DISCORD_TOKEN` and
  `DATABASE_URL` from its own logs; keep it that way.
