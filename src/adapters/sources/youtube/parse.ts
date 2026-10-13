const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

export type YouTubeInput =
  | { kind: 'video'; videoId: string }
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'search'; query: string };

export function isUrl(input: string): boolean {
  return /^https?:\/\//i.test(input.trim());
}

export function isYouTubeUrl(input: string): boolean {
  const url = tryParseUrl(input);
  return url !== undefined && YOUTUBE_HOSTS.has(url.hostname.toLowerCase());
}

/**
 * Classifies user input. A watch URL that also carries `list=` is treated as the
 * single video, matching what people usually mean when they paste it.
 * Returns undefined for a YouTube URL we can't play (channel pages, etc.).
 */
export function parseYouTubeInput(input: string): YouTubeInput | undefined {
  const trimmed = input.trim();
  if (!isUrl(trimmed)) return { kind: 'search', query: trimmed };

  const url = tryParseUrl(trimmed);
  if (!url || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return undefined;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  let videoId: string | null | undefined;
  if (host.endsWith('youtu.be')) videoId = segments[0];
  else if (segments[0] === 'watch') videoId = url.searchParams.get('v');
  else if (['shorts', 'embed', 'live', 'v'].includes(segments[0] ?? '')) videoId = segments[1];

  if (videoId && VIDEO_ID.test(videoId)) return { kind: 'video', videoId };

  const list = url.searchParams.get('list');
  if (list && PLAYLIST_ID.test(list)) return { kind: 'playlist', playlistId: list };

  return undefined;
}

/** Parses ISO-8601 durations as used by the YouTube API ("PT1H2M3S", "P1DT2H"). */
export function parseIsoDuration(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!m) return undefined;
  const [, d = '0', h = '0', min = '0', s = '0'] = m;
  const total = Number(d) * 86400 + Number(h) * 3600 + Number(min) * 60 + Number(s);
  // "P0D" is what the API returns for live streams.
  return total > 0 ? total : undefined;
}

function tryParseUrl(input: string): URL | undefined {
  try {
    return new URL(input.trim());
  } catch {
    return undefined;
  }
}
