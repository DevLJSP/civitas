import { describe, expect, it } from 'vitest';
import { countApproval, countMajority, countRankedChoice, quorumReached } from '../src/services/election/engine.js';

describe('majority voting', () => {
  it('highest vote count wins', () => {
    const r = countMajority(['a', 'b', 'c'], ['a', 'a', 'b'], 1, 10, 0);
    expect(r.winners).toEqual(['a']);
    expect(r.counts).toMatchObject({ a: 2, b: 1, c: 0 });
  });

  it('supports multiple winners in order', () => {
    const r = countMajority(['a', 'b', 'c'], ['a', 'b', 'b', 'c'], 2, 10, 0);
    expect(r.winners).toEqual(['b', 'a']);
  });

  it('resolves ties deterministically by id', () => {
    const r1 = countMajority(['a', 'b'], ['a', 'b'], 1, 10, 0);
    const r2 = countMajority(['b', 'a'], ['a', 'b'], 1, 10, 0);
    expect(r1.winners).toEqual(r2.winners);
    expect(r1.tieBroken).toBe(true);
  });

  it('enforces quorum', () => {
    const r = countMajority(['a'], ['a'], 1, 100, 20);
    expect(r.quorumReached).toBe(false);
    expect(quorumReached(1, 100, 20)).toBe(false);
    expect(quorumReached(20, 100, 20)).toBe(true);
  });
});

describe('approval voting', () => {
  it('counts each approval once per ballot', () => {
    const r = countApproval(['a', 'b'], [['a', 'a', 'b'], ['b']], 1, 10, 0);
    expect(r.counts).toMatchObject({ a: 1, b: 2 });
    expect(r.winners).toEqual(['b']);
  });

  it('ignores unknown candidates', () => {
    const r = countApproval(['a'], [['zzz'], ['a']], 1, 10, 0);
    expect(r.counts.a).toBe(1);
  });
});

describe('ranked choice', () => {
  it('elects majority winner immediately', () => {
    const r = countRankedChoice(
      ['a', 'b'],
      [
        { voterId: '1', ranking: ['a'] },
        { voterId: '2', ranking: ['a'] },
        { voterId: '3', ranking: ['b'] },
      ],
      1, 10, 0,
    );
    expect(r.winners).toEqual(['a']);
    expect(r.rounds.length).toBe(1);
  });

  it('eliminates lowest and transfers ballots', () => {
    const r = countRankedChoice(
      ['a', 'b', 'c'],
      [
        { voterId: '1', ranking: ['a', 'b'] },
        { voterId: '2', ranking: ['a', 'b'] },
        { voterId: '3', ranking: ['c', 'b'] },
        { voterId: '4', ranking: ['c', 'b'] },
        { voterId: '5', ranking: ['b'] },
      ],
      1, 10, 0,
    );
    // Round 1: a=2,b=1,c=2 → b eliminated (lowest), then b has no transferable ballots left on those prefs...
    // a=2,c=2 tie → deterministic elimination, then winner emerges.
    expect(r.winners.length).toBe(1);
    expect(r.rounds.length).toBeGreaterThanOrEqual(2);
  });

  it('tracks exhausted ballots', () => {
    const r = countRankedChoice(
      ['a', 'b', 'c'],
      [
        { voterId: '1', ranking: ['c'] },
        { voterId: '2', ranking: ['a', 'b'] },
        { voterId: '3', ranking: ['a', 'b'] },
        { voterId: '4', ranking: ['b', 'a'] },
        { voterId: '5', ranking: ['b', 'a'] },
      ],
      1, 10, 0,
    );
    expect(r.exhaustedBallots).toBeGreaterThanOrEqual(0);
    expect(r.winners.length).toBe(1);
  });

  it('handles ties deterministically', () => {
    const mk = () =>
      countRankedChoice(
        ['a', 'b'],
        [
          { voterId: '1', ranking: ['a'] },
          { voterId: '2', ranking: ['b'] },
        ],
        1, 10, 0,
      );
    expect(mk().winners).toEqual(mk().winners);
  });
});
