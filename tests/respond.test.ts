import { describe, expect, it, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import { isUnknownInteraction, respond } from '../src/utils/respond.js';

function mockInteraction(state: { deferred: boolean; replied: boolean }) {
  return {
    deferred: state.deferred,
    replied: state.replied,
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
  };
}

describe('isUnknownInteraction', () => {
  it('detects Discord 10062 expiry', () => {
    expect(isUnknownInteraction({ code: 10062 })).toBe(true);
    expect(isUnknownInteraction({ code: 40060 })).toBe(false);
    expect(isUnknownInteraction(new Error('boom'))).toBe(false);
    expect(isUnknownInteraction(null)).toBe(false);
  });
});

describe('respond routing', () => {
  it('replies directly when fresh', async () => {
    const ix = mockInteraction({ deferred: false, replied: false });
    await respond(ix as never, { content: 'hi', flags: MessageFlags.Ephemeral });
    expect(ix.reply).toHaveBeenCalledTimes(1);
    expect(ix.editReply).not.toHaveBeenCalled();
    expect(ix.followUp).not.toHaveBeenCalled();
  });

  it('edits when deferred and strips visibility flags', async () => {
    const ix = mockInteraction({ deferred: true, replied: false });
    await respond(ix as never, { content: 'hi', flags: MessageFlags.Ephemeral });
    expect(ix.editReply).toHaveBeenCalledTimes(1);
    const sent = ix.editReply.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('flags');
    expect(sent).not.toHaveProperty('ephemeral');
  });

  it('follows up when already replied', async () => {
    const ix = mockInteraction({ deferred: false, replied: true });
    await respond(ix as never, { content: 'hi' });
    expect(ix.followUp).toHaveBeenCalledTimes(1);
  });

  it('swallows expired tokens instead of throwing', async () => {
    const ix = mockInteraction({ deferred: false, replied: false });
    ix.reply.mockRejectedValueOnce({ code: 10062 });
    await expect(respond(ix as never, { content: 'hi' })).resolves.toBeUndefined();
  });

  it('rethrows non-expiry errors', async () => {
    const ix = mockInteraction({ deferred: false, replied: false });
    ix.reply.mockRejectedValueOnce(new Error('network down'));
    await expect(respond(ix as never, { content: 'hi' })).rejects.toThrow('network down');
  });
});
