import { describe, expect, it, vi } from 'vitest';
import { KeyMissingError, SourceError, UserError } from '../src/core/errors.js';
import type { ResolveContext, Track, TrackInfo } from '../src/core/types.js';
import type { MusicPlayer, VoiceTarget } from '../src/music/types.js';
import type { TrackSource } from '../src/ports/TrackSource.js';
import { MusicService } from '../src/services/MusicService.js';

const info = (id: string): TrackInfo => ({ id, title: id, url: `https://x/${id}`, source: 'fake' });

function fakeSource(id: string, matches: (input: string) => boolean, requiresApiKey = false) {
  return {
    id,
    displayName: id,
    requiresApiKey,
    canHandle: vi.fn(matches),
    resolve: vi.fn(async (_input: string, _ctx: ResolveContext) => [info(`${id}-1`)]),
  } satisfies TrackSource;
}

function fakePlayer(active = false): MusicPlayer & { queued: Track[] } {
  const queued: Track[] = [];
  return {
    guildId: 'g1',
    channelId: undefined,
    announceChannelId: undefined,
    isActive: active,
    queued,
    connect: vi.fn(async () => {}),
    enqueue: vi.fn((tracks: Track[]) => {
      queued.push(...tracks);
      return tracks.length;
    }),
    skip: vi.fn(() => undefined),
    pause: vi.fn(() => true),
    resume: vi.fn(() => true),
    shuffle: vi.fn(() => 0),
    nowPlaying: vi.fn(() => undefined),
    upcoming: vi.fn(() => ({ tracks: [], total: queued.length })),
    setListenersPresent: vi.fn(),
    destroy: vi.fn(),
  };
}

const voice = { guildId: 'g1', channelId: 'c1', adapterCreator: vi.fn() } as unknown as VoiceTarget;

function setup(opts: { sources: TrackSource[]; key?: string; player?: MusicPlayer }) {
  const player = opts.player ?? fakePlayer();
  const keys = { getKey: vi.fn(async () => opts.key) };
  const players = { get: vi.fn(() => player), getOrCreate: vi.fn(() => player) };
  return { player, keys, players, service: new MusicService({ sources: opts.sources, keys, players }) };
}

describe('MusicService.play', () => {
  it('uses the first source that can handle the input', async () => {
    const a = fakeSource('a', () => false);
    const b = fakeSource('b', () => true);
    const c = fakeSource('c', () => true);
    const { service } = setup({ sources: [a, b, c] });

    const result = await service.play({ guildId: 'g1', userId: 'u1', query: 'song', voice });
    expect(result.sourceName).toBe('b');
    expect(c.resolve).not.toHaveBeenCalled();
  });

  it("passes the requesting user's key to sources that need one", async () => {
    const yt = fakeSource('yt', () => true, true);
    const { service } = setup({ sources: [yt], key: 'USER-KEY' });
    await service.play({ guildId: 'g1', userId: 'u1', query: 'song', voice });
    expect(yt.resolve).toHaveBeenCalledWith('song', { userId: 'u1', apiKey: 'USER-KEY' });
  });

  it('refuses before touching voice when the user has no key', async () => {
    const yt = fakeSource('yt', () => true, true);
    const { service, player } = setup({ sources: [yt] });
    await expect(service.play({ guildId: 'g1', userId: 'u1', query: 'song', voice })).rejects.toBeInstanceOf(KeyMissingError);
    expect(yt.resolve).not.toHaveBeenCalled();
    expect(player.connect).not.toHaveBeenCalled();
  });

  it('does not join voice when nothing is found', async () => {
    const src = fakeSource('s', () => true);
    src.resolve.mockResolvedValueOnce([]);
    const { service, player } = setup({ sources: [src] });
    await expect(service.play({ guildId: 'g1', userId: 'u1', query: 'x', voice })).rejects.toBeInstanceOf(SourceError);
    expect(player.connect).not.toHaveBeenCalled();
  });

  it('tags tracks with the requester and reports the queue position', async () => {
    const player = fakePlayer(true);
    player.queued.push({ ...info('existing'), requestedBy: 'u0' });
    const { service } = setup({ sources: [fakeSource('s', () => true)], player });

    const result = await service.play({ guildId: 'g1', userId: 'u1', query: 'x', voice, announceChannelId: 't1' });
    expect(result).toMatchObject({ startsNow: false, position: 2, resolvedCount: 1 });
    expect(player.queued[1]?.requestedBy).toBe('u1');
    expect(player.announceChannelId).toBe('t1');
  });

  it('rejects empty and unsupported input', async () => {
    const { service } = setup({ sources: [fakeSource('s', () => false)] });
    await expect(service.play({ guildId: 'g1', userId: 'u1', query: '  ', voice })).rejects.toBeInstanceOf(UserError);
    await expect(service.play({ guildId: 'g1', userId: 'u1', query: 'https://x', voice })).rejects.toBeInstanceOf(SourceError);
  });
});

describe('MusicService controls', () => {
  it('explains when nothing is playing', () => {
    const { service } = setup({ sources: [], player: fakePlayer(false) });
    expect(() => service.skip('g1')).toThrow(UserError);
    expect(() => service.pause('g1')).toThrow(UserError);
  });

  it('stop destroys the player', () => {
    const { service, player } = setup({ sources: [] });
    service.stop('g1');
    expect(player.destroy).toHaveBeenCalledWith('stopped by user');
  });
});
