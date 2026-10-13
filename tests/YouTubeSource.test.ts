import { describe, expect, it, vi } from 'vitest';
import type { VideoDetails } from '../src/adapters/sources/youtube/YouTubeApiClient.js';
import { YouTubeSource } from '../src/adapters/sources/youtube/YouTubeSource.js';
import { KeyMissingError, SourceError } from '../src/core/errors.js';

const video = (id: string, extra: Partial<VideoDetails> = {}): VideoDetails => ({
  id,
  title: `Title ${id}`,
  durationSeconds: 100,
  liveBroadcastContent: 'none',
  ...extra,
});

function setup() {
  const api = {
    searchVideoIds: vi.fn(async () => ['upcoming123', 'good1234567']),
    getVideos: vi.fn(async (_key: string, ids: string[]) =>
      ids.map((id) => video(id, id.startsWith('upcoming') ? { liveBroadcastContent: 'upcoming' } : {})),
    ),
    getPlaylistVideoIds: vi.fn(async () => ['p1xxxxxxxxx', 'p2xxxxxxxxx']),
  };
  return { api, source: new YouTubeSource(api, { maxPlaylistItems: 25 }) };
}

const ctx = { userId: 'u1', apiKey: 'KEY' };

describe('YouTubeSource', () => {
  it('handles search text and YouTube links, but not other sites', () => {
    const { source } = setup();
    expect(source.canHandle('never gonna give you up')).toBe(true);
    expect(source.canHandle('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(source.canHandle('https://soundcloud.com/x/y')).toBe(false);
  });

  it('searches and returns the first playable result', async () => {
    const { source, api } = setup();
    const [track, ...rest] = await source.resolve('lofi', ctx);
    expect(rest).toHaveLength(0);
    expect(track).toMatchObject({ id: 'good1234567', url: 'https://www.youtube.com/watch?v=good1234567', source: 'youtube' });
    expect(api.searchVideoIds).toHaveBeenCalledWith('KEY', 'lofi', 5);
  });

  it('resolves a playlist with the configured cap', async () => {
    const { source, api } = setup();
    const tracks = await source.resolve('https://www.youtube.com/playlist?list=PL0123456789', ctx);
    expect(tracks.map((t) => t.id)).toEqual(['p1xxxxxxxxx', 'p2xxxxxxxxx']);
    expect(api.getPlaylistVideoIds).toHaveBeenCalledWith('KEY', 'PL0123456789', 25);
  });

  it('resolves a single video link', async () => {
    const { source } = setup();
    const tracks = await source.resolve('https://youtu.be/dQw4w9WgXcQ', ctx);
    expect(tracks.map((t) => t.id)).toEqual(['dQw4w9WgXcQ']);
  });

  it('needs the user key', async () => {
    const { source } = setup();
    await expect(source.resolve('lofi', { userId: 'u1' })).rejects.toBeInstanceOf(KeyMissingError);
  });

  it('explains when a video is unavailable', async () => {
    const { source, api } = setup();
    api.getVideos.mockResolvedValueOnce([]);
    await expect(source.resolve('https://youtu.be/dQw4w9WgXcQ', ctx)).rejects.toBeInstanceOf(SourceError);
  });
});
