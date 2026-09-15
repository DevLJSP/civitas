import type { ElectionCountResult, RankedBallot, RankedRound } from '../../types/index.js';

/** Deterministic tie-break: lexicographically smallest id wins. Documented + testable. */
export function breakTie(ids: string[]): string {
  const sorted = [...ids].sort();
  const first = sorted[0];
  if (!first) throw new Error('breakTie requires at least one id');
  return first;
}

export function countMajority(
  candidateIds: string[],
  votes: string[],
  seats: number,
  eligibleVoters: number,
  quorumPercent: number,
): ElectionCountResult {
  const counts: Record<string, number> = {};
  for (const c of candidateIds) counts[c] = 0;
  for (const v of votes) {
    if (v in counts) counts[v] = (counts[v] ?? 0) + 1;
  }
  const turnout = votes.length;
  const quorumReached = eligibleVoters <= 0 ? true : (turnout / eligibleVoters) * 100 >= quorumPercent;
  const sorted = [...candidateIds].sort((a, b) => {
    const d = (counts[b] ?? 0) - (counts[a] ?? 0);
    if (d !== 0) return d;
    return a.localeCompare(b);
  });
  const winners = sorted.slice(0, Math.max(1, seats));
  // Detect tie at cutoff for transparency.
  let tieBroken = false;
  let tieDetail: string | undefined;
  if (winners.length > 0 && sorted.length > winners.length) {
    const last = winners[winners.length - 1] as string;
    const next = sorted[winners.length] as string;
    if ((counts[last] ?? 0) === (counts[next] ?? 0)) {
      tieBroken = true;
      tieDetail = `Tie at cutoff (${counts[last]} votes) resolved deterministically by id order.`;
    }
  }
  return { winners, counts, exhaustedBallots: 0, turnout, quorumReached, tieBroken, tieDetail };
}

export function countApproval(
  candidateIds: string[],
  ballots: string[][],
  seats: number,
  eligibleVoters: number,
  quorumPercent: number,
): ElectionCountResult {
  const counts: Record<string, number> = {};
  for (const c of candidateIds) counts[c] = 0;
  for (const ballot of ballots) {
    const unique = new Set(ballot.filter((c) => c in counts));
    for (const c of unique) counts[c] = (counts[c] ?? 0) + 1;
  }
  const turnout = ballots.length;
  const quorumReached = eligibleVoters <= 0 ? true : (turnout / eligibleVoters) * 100 >= quorumPercent;
  const sorted = [...candidateIds].sort((a, b) => {
    const d = (counts[b] ?? 0) - (counts[a] ?? 0);
    if (d !== 0) return d;
    return a.localeCompare(b);
  });
  const winners = sorted.slice(0, Math.max(1, seats));
  let tieBroken = false;
  let tieDetail: string | undefined;
  if (winners.length > 0 && sorted.length > winners.length) {
    const last = winners[winners.length - 1] as string;
    const next = sorted[winners.length] as string;
    if ((counts[last] ?? 0) === (counts[next] ?? 0)) {
      tieBroken = true;
      tieDetail = `Tie at cutoff (${counts[last]} approvals) resolved deterministically by id order.`;
    }
  }
  return { winners, counts, exhaustedBallots: 0, turnout, quorumReached, tieBroken, tieDetail };
}

/**
 * Ranked-choice (instant runoff) with proper elimination rounds.
 * - Each ballot is an ordered list of candidate ids (first = top preference).
 * - Majority threshold is computed over *continuing* ballots each round.
 * - Exhausted ballots (no remaining continuing candidate) are tracked.
 * - Ties for elimination are resolved deterministically (fewest votes, then largest id eliminated
 *   so that smallest id survives — consistent with breakTie for winners).
 * - Multi-winner: after a candidate exceeds quota they are seated and their ballots are
 *   transferred at full value to next preferences (simplified STV). For seats=1 this is pure IRV.
 */
export function countRankedChoice(
  candidateIds: string[],
  ballots: RankedBallot[],
  seats: number,
  eligibleVoters: number,
  quorumPercent: number,
): ElectionCountResult {
  const turnout = ballots.length;
  const quorumReached = eligibleVoters <= 0 ? true : (turnout / eligibleVoters) * 100 >= quorumPercent;
  const rounds: RankedRound[] = [];
  const seated: string[] = [];
  const eliminated = new Set<string>();
  const exhaustedByRound: number[] = [];
  let tieBroken = false;

  const continuing = (): string[] => candidateIds.filter((c) => !eliminated.has(c) && !seated.includes(c));

  // Deep copy of ballot preferences for transfer.
  const prefs: string[][] = ballots.map((b) => b.ranking.filter((c) => candidateIds.includes(c)));

  const target = Math.max(1, seats);
  let round = 0;

  while (seated.length < target && continuing().length > 0) {
    round += 1;
    const cont = continuing();
    const counts: Record<string, number> = {};
    for (const c of cont) counts[c] = 0;
    let exhausted = 0;
    for (const p of prefs) {
      const top = p.find((c) => cont.includes(c));
      if (!top) exhausted += 1;
      else counts[top] = (counts[top] ?? 0) + 1;
    }
    const active = turnout - exhausted;
    const quota = Math.floor(active / 2) + 1;

    // Check for winner(s): anyone reaching quota.
    const above = cont.filter((c) => (counts[c] ?? 0) >= quota).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || a.localeCompare(b));
    if (above.length > 0) {
      const winner = above[0] as string;
      seated.push(winner);
      rounds.push({ round, counts: { ...counts }, eliminated: null, exhausted });
      exhaustedByRound.push(exhausted);
      if (seated.length >= target) {
        const finalCounts: Record<string, number> = {};
        for (const c of candidateIds) finalCounts[c] = counts[c] ?? 0;
        return {
          winners: seated.slice(0, target),
          rounds,
          counts: finalCounts,
          exhaustedBallots: exhausted,
          turnout,
          quorumReached,
          tieBroken,
        };
      }
      // Transfer winner's ballots: remove winner from all prefs so next preferences surface.
      for (const p of prefs) {
        const i = p.indexOf(winner);
        if (i >= 0) p.splice(i, 1);
      }
      continue;
    }

    // No quota: eliminate lowest. If only remaining seats equal remaining candidates, seat them all.
    const contSorted = [...cont].sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0) || b.localeCompare(a));
    const remaining = cont.length;
    const seatsLeft = target - seated.length;
    if (remaining <= seatsLeft) {
      for (const c of cont) seated.push(c);
      rounds.push({ round, counts: { ...counts }, eliminated: null, exhausted });
      exhaustedByRound.push(exhausted);
      break;
    }

    // Eliminate single lowest (deterministic: lowest count; tie -> largest id eliminated).
    const lowestCount = Math.min(...cont.map((c) => counts[c] ?? 0));
    const tiedLow = cont.filter((c) => (counts[c] ?? 0) === lowestCount);
    if (tiedLow.length > 1) tieBroken = true;
    const toEliminate = [...tiedLow].sort().reverse()[0] as string;
    eliminated.add(toEliminate);
    rounds.push({ round, counts: { ...counts }, eliminated: toEliminate, exhausted });
    exhaustedByRound.push(exhausted);
    for (const p of prefs) {
      const i = p.indexOf(toEliminate);
      if (i >= 0) p.splice(i, 1);
    }

    if (round > candidateIds.length + 5) break; // safety
  }

  const finalCounts: Record<string, number> = {};
  const last = rounds[rounds.length - 1];
  for (const c of candidateIds) finalCounts[c] = last?.counts[c] ?? 0;
  return {
    winners: seated.slice(0, target),
    rounds,
    counts: finalCounts,
    exhaustedBallots: exhaustedByRound[exhaustedByRound.length - 1] ?? 0,
    turnout,
    quorumReached,
    tieBroken,
  };
}

export function quorumReached(turnout: number, eligible: number, quorumPercent: number): boolean {
  if (eligible <= 0) return true;
  return (turnout / eligible) * 100 >= quorumPercent;
}
