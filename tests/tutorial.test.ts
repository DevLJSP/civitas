import { describe, expect, it } from 'vitest';
import {
  assertTutorialOwnership,
  canOpenTestElection,
  cleanupPlan,
  isFirstStep,
  isLastStep,
  nextStep,
  parseStep,
  prevStep,
  TUTORIAL_STEPS,
} from '../src/services/tutorialService.js';
import { helpTopicKeys, resolveHelpTopic } from '../src/commands/help.js';

describe('tutorial step machine', () => {
  it('walks forward and back without leaving bounds', () => {
    expect(TUTORIAL_STEPS).toEqual(['welcome', 'channels', 'position', 'election', 'done']);
    let step = parseStep('welcome');
    for (const expected of ['channels', 'position', 'election', 'done', 'done']) {
      step = nextStep(step);
      expect(step).toBe(expected);
    }
    for (const expected of ['election', 'position', 'channels', 'welcome', 'welcome']) {
      step = prevStep(step);
      expect(step).toBe(expected);
    }
  });

  it('parses unknown steps to welcome', () => {
    expect(parseStep('nonsense')).toBe('welcome');
    expect(parseStep(undefined)).toBe('welcome');
    expect(parseStep('election')).toBe('election');
  });

  it('marks first/last steps', () => {
    expect(isFirstStep('welcome')).toBe(true);
    expect(isFirstStep('channels')).toBe(false);
    expect(isLastStep('done')).toBe(true);
    expect(isLastStep('election')).toBe(false);
  });
});

describe('tutorial election gate', () => {
  it('blocks the test election until the position exists', () => {
    expect(canOpenTestElection({ createdPositionId: null }).ok).toBe(false);
    expect(canOpenTestElection({ createdPositionId: 'pos_1' }).ok).toBe(true);
  });
});

describe('tutorial cleanup plan', () => {
  it('only acts on artifacts that still exist (idempotent)', () => {
    expect(cleanupPlan({ createdPositionId: null, createdElectionId: null })).toEqual({
      cancelElection: false,
      deactivatePosition: false,
    });
    expect(cleanupPlan({ createdPositionId: 'p', createdElectionId: 'e' })).toEqual({
      cancelElection: true,
      deactivatePosition: true,
    });
  });
});

describe('tutorial cross-guild isolation', () => {
  it('rejects mismatched guilds', () => {
    expect(() => assertTutorialOwnership('A', 'B')).toThrow();
    expect(() => assertTutorialOwnership('A', 'A')).not.toThrow();
  });
});

describe('help topics', () => {
  it('hides manager topics from members', () => {
    const member = helpTopicKeys(false);
    const manager = helpTopicKeys(true);
    expect(member).toContain('start');
    expect(member).toContain('elections');
    expect(member).not.toContain('positions');
    expect(member).not.toContain('removal');
    expect(manager.length).toBeGreaterThan(member.length);
    expect(manager).toContain('removal');
  });

  it('falls back to start for unknown topics', () => {
    expect(resolveHelpTopic('nope').key).toBe('start');
    expect(resolveHelpTopic(undefined).key).toBe('start');
    expect(resolveHelpTopic('mandates').key).toBe('mandates');
  });
});
