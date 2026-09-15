# Support server playbook (dogfooding = marketing)

The support server is both helpdesk and live demo. Run it on Civitas itself.

## Channels

- `#start-here` — invite + `/tutorial` pointer + rules
- `#announcements` — election openings, results, releases (read-only)
- `#elections` — set as election channel in `/setup channels`
- `#applications` — set as applications channel
- `#general` + `#support` — community + helpdesk
- `#changelog` — GitHub Release notes, one post per version

## Dogfood script (do this publicly, it IS the demo)

1. Run `/tutorial` in front of everyone; keep the Tutorial Captain.
2. Open real applications for a Moderator role; approve your first mods live.
3. Hold a ranked-choice Captain election with 3+ candidates.
4. Put new leaders on 14-day probation; narrate approve/fail in announcements.
5. Run a fun community proposal (`Should game night move to Fridays?`).
6. Pin results + stats screenshots (`/stats`, `/leaderboard`).

## Vote loop (once listed on top.gg)

- Add the top.gg vote link to `#start-here` and the server description.
- Voter role for people who vote (manual at first; automated via the webhook
  in `webhook-plan.md` once built).
- Thank-you message in `#general` naming recent voters (weekly).

## Rules of engagement

- Never DM-invite; never spam other servers with the bot link.
- In other communities, help first — link Civitas only when it solves the
  asked question.
- Every release: one `#changelog` post + update the top.gg long description
  if features changed.
