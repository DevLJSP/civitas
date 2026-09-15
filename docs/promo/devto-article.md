# Dev.to article draft: ranked-choice elections inside Discord

Suggested title: **I implemented ranked-choice voting inside a Discord bot — here's the counting engine**

## Outline (write ~800 words around this skeleton)

1. **The problem** — Discord polls are plurality-only. Gaming clans and RP
   servers elect captains with 5 candidates splitting votes; winners with 25%
   feel illegitimate. Ranked choice fixes that, but nobody implements it right.
2. **The engine** (~core of the article) — instant-runoff with:
   - quota = floor(active/2)+1 recomputed per round over *continuing* ballots
   - exhausted-ballot tracking (ballots with no remaining ranked candidate)
   - deterministic tie-breaking (lexicographic id order — boring, auditable,
     and testable beats random every time)
   - multi-winner support via winner seating + ballot transfer (STV-lite)
   - show the round-by-round result object; mention the 10 unit tests
3. **The anonymity problem** — Discord knows who clicked what. Solution: split
   storage into `ElectionVote` (ballot, `voterId = NULL` when anonymous) +
   `ElectionVoterReceipt` (one row per voter, unique constraint = no doubles).
   Casual queries of votes can never reconstruct who voted for whom.
4. **Race conditions Discord devs forget** — election closing mid-vote, double
   clicks, bot restarts mid-election. Answer: Postgres transactions +
   idempotent finalization + a DB-backed scheduler, not `setTimeout`.
5. **Try it** — link repo + `/tutorial`. End with an invitation to break the
   counting (adversarial testing welcome).

Tags: `discord`, `typescript`, `postgres`, `opensource`
Canonical link: keep on dev.to first, repost to Hashnode a week later.
