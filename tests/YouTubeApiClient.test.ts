import { describe, expect, it, vi } from 'vitest';
import { YouTubeApiClient } from '../src/adapters/sources/youtube/YouTubeApiClient.js';
import {
  ApiNotEnabledError,
  InvalidKeyError,
  QuotaExceededError,
  SourceUnavailableError,
} from '../src/core/errors.js';
import { FAKE_API_KEY, silentLogger } from './helpers.js';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const apiError = (status: number, reason: string, message = 'error', detailReason?: string) =>
  json(status, {
    error: {
      code: status,
      message,
      errors: [{ reason }],
      ...(detailReason && { details: [{ reason: detailReason }] }),
    },
  });

function client(...responses: (Response | Error)[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const r of responses) {
    if (r instanceof Error) fetch.mockRejectedValueOnce(r);
    else fetch.mockResolvedValueOnce(r);
  }
  return { fetch, api: new YouTubeApiClient({ fetch, logger: silentLogger(), retryDelayMs: 0 }) };
}

describe('YouTubeApiClient error mapping', () => {
  it.each([
    ['invalid key', apiError(400, 'badRequest', 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID'), InvalidKeyError],
    ['quota', apiError(403, 'quotaExceeded'), QuotaExceededError],
    ['API disabled', apiError(403, 'accessNotConfigured', 'disabled', 'SERVICE_DISABLED'), ApiNotEnabledError],
    ['restricted key', apiError(403, 'forbidden', 'blocked', 'API_KEY_HTTP_REFERRER_BLOCKED'), InvalidKeyError],
  ])('%s', async (_name, response, errorClass) => {
    const { api } = client(response);
    await expect(api.validate(FAKE_API_KEY)).rejects.toBeInstanceOf(errorClass);
  });

  it('retries once on 5xx, then succeeds', async () => {
    const { api, fetch } = client(json(503, {}), json(200, { items: [] }));
    await expect(api.validate(FAKE_API_KEY)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after a second network failure without leaking the key', async () => {
    const { api, fetch } = client(new TypeError('fetch failed'), new TypeError('fetch failed'));
    const err = await api.validate(FAKE_API_KEY).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceUnavailableError);
    expect((err as Error).message).not.toContain(FAKE_API_KEY);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry quota errors', async () => {
    const { api, fetch } = client(apiError(403, 'quotaExceeded'));
    await expect(api.validate(FAKE_API_KEY)).rejects.toBeInstanceOf(QuotaExceededError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('YouTubeApiClient data', () => {
  it('maps video details in request order', async () => {
    const { api, fetch } = client(
      json(200, {
        items: [
          { id: 'bbbbbbbbbbb', snippet: { title: 'B', liveBroadcastContent: 'none' }, contentDetails: { duration: 'PT1M' } },
          {
            id: 'aaaaaaaaaaa',
            snippet: { title: 'A', liveBroadcastContent: 'live', thumbnails: { high: { url: 'https://img/a' } } },
            contentDetails: { duration: 'P0D' },
          },
        ],
      }),
    );
    const videos = await api.getVideos(FAKE_API_KEY, ['aaaaaaaaaaa', 'missingxxxx', 'bbbbbbbbbbb']);
    expect(videos).toEqual([
      { id: 'aaaaaaaaaaa', title: 'A', thumbnailUrl: 'https://img/a', liveBroadcastContent: 'live' },
      { id: 'bbbbbbbbbbb', title: 'B', durationSeconds: 60, liveBroadcastContent: 'none' },
    ]);
    const url = new URL(fetch.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/youtube/v3/videos');
    expect(url.searchParams.get('key')).toBe(FAKE_API_KEY);
  });

  it('follows playlist pages up to the limit', async () => {
    const page = (ids: string[], next?: string) =>
      json(200, { items: ids.map((videoId) => ({ contentDetails: { videoId } })), nextPageToken: next });
    const { api, fetch } = client(page(['a', 'b'], 'p2'), page(['c', 'd'], 'p3'));
    expect(await api.getPlaylistVideoIds(FAKE_API_KEY, 'PL123', 3)).toEqual(['a', 'b', 'c']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(fetch.mock.calls[1]![0] as string).searchParams.get('pageToken')).toBe('p2');
  });
});
