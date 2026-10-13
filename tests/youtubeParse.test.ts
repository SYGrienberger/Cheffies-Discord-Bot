import { describe, expect, it } from 'vitest';
import { parseIsoDuration, parseYouTubeInput } from '../src/adapters/sources/youtube/parse.js';

describe('parseYouTubeInput', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghij', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=42', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('%s → video', (url, videoId) => {
    expect(parseYouTubeInput(url)).toEqual({ kind: 'video', videoId });
  });

  it('recognises playlists', () => {
    expect(parseYouTubeInput('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG')).toEqual({
      kind: 'playlist',
      playlistId: 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG',
    });
  });

  it('treats non-URLs as searches', () => {
    expect(parseYouTubeInput('  lofi hip hop  ')).toEqual({ kind: 'search', query: 'lofi hip hop' });
  });

  it('returns undefined for unplayable or foreign URLs', () => {
    expect(parseYouTubeInput('https://www.youtube.com/@somechannel')).toBeUndefined();
    expect(parseYouTubeInput('https://example.com/watch?v=dQw4w9WgXcQ')).toBeUndefined();
  });
});

describe('parseIsoDuration', () => {
  it.each([
    ['PT3M33S', 213],
    ['PT1H2M5S', 3725],
    ['PT45S', 45],
    ['P1DT1S', 86401],
  ])('%s → %d', (iso, seconds) => {
    expect(parseIsoDuration(iso)).toBe(seconds);
  });

  it('returns undefined for live streams and junk', () => {
    expect(parseIsoDuration('P0D')).toBeUndefined();
    expect(parseIsoDuration(undefined)).toBeUndefined();
    expect(parseIsoDuration('3 minutes')).toBeUndefined();
  });
});
