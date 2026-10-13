import { setTimeout as sleep } from 'node:timers/promises';
import {
  ApiNotEnabledError,
  AppError,
  InvalidKeyError,
  QuotaExceededError,
  SourceUnavailableError,
} from '../../../core/errors.js';
import type { Logger } from '../../../core/logger.js';
import type { ApiKeyValidator } from '../../../ports/ApiKeyValidator.js';
import { parseIsoDuration } from './parse.js';

const BASE_URL = 'https://www.googleapis.com/youtube/v3';
/** A permanent, public video used to test keys (`videos.list` costs 1 quota unit). */
const PROBE_VIDEO_ID = 'jNQXAC9IVRw';

export interface VideoDetails {
  id: string;
  title: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  /** 'none' | 'live' | 'upcoming' */
  liveBroadcastContent: string;
}

export interface YouTubeApiClientOptions {
  logger: Logger;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Delay before the single retry on 5xx/network errors. */
  retryDelayMs?: number;
}

interface ApiErrorBody {
  error?: {
    code?: number;
    message?: string;
    errors?: { reason?: string }[];
    details?: { reason?: string }[];
  };
}

/**
 * Thin, typed wrapper over the YouTube Data API v3. Every call takes the
 * *caller's* API key, so each user's searches count against their own quota.
 *
 * Security: request URLs contain the key, so they are never logged or put
 * into error messages.
 */
export class YouTubeApiClient implements ApiKeyValidator {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly logger: Logger;

  constructor(opts: YouTubeApiClientOptions) {
    this.fetchFn = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.retryDelayMs = opts.retryDelayMs ?? 750;
    this.logger = opts.logger;
  }

  async validate(apiKey: string): Promise<void> {
    await this.request('videos', { part: 'id', id: PROBE_VIDEO_ID }, apiKey);
  }

  /** Returns up to `maxResults` video ids for a query (100 quota units). */
  async searchVideoIds(apiKey: string, query: string, maxResults = 1): Promise<string[]> {
    const body = await this.request<{ items?: { id?: { videoId?: string } }[] }>(
      'search',
      { part: 'id', type: 'video', q: query, maxResults: String(maxResults), safeSearch: 'none' },
      apiKey,
    );
    return (body.items ?? []).map((i) => i.id?.videoId).filter((id): id is string => !!id);
  }

  /** Fetches details for up to 50 ids per call (1 quota unit per call). Missing/private videos are omitted. */
  async getVideos(apiKey: string, ids: string[]): Promise<VideoDetails[]> {
    const results: VideoDetails[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const body = await this.request<{ items?: RawVideo[] }>(
        'videos',
        { part: 'snippet,contentDetails', id: chunk.join(','), maxResults: '50' },
        apiKey,
      );
      const byId = new Map((body.items ?? []).map((v) => [v.id, toVideoDetails(v)]));
      // Keep the caller's order (the API does not guarantee it).
      for (const id of chunk) {
        const v = byId.get(id);
        if (v) results.push(v);
      }
    }
    return results;
  }

  /** Lists video ids in a playlist, following pages until `max` (1 quota unit per 50). */
  async getPlaylistVideoIds(apiKey: string, playlistId: string, max: number): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const params: Record<string, string> = {
        part: 'contentDetails',
        playlistId,
        maxResults: String(Math.min(50, max - ids.length)),
      };
      if (pageToken) params.pageToken = pageToken;
      const body = await this.request<{
        items?: { contentDetails?: { videoId?: string } }[];
        nextPageToken?: string;
      }>('playlistItems', params, apiKey);
      for (const item of body.items ?? []) {
        const id = item.contentDetails?.videoId;
        if (id) ids.push(id);
      }
      pageToken = body.nextPageToken;
    } while (pageToken && ids.length < max);
    return ids.slice(0, max);
  }

  private async request<T>(endpoint: string, params: Record<string, string>, apiKey: string): Promise<T> {
    const url = `${BASE_URL}/${endpoint}?${new URLSearchParams({ ...params, key: apiKey }).toString()}`;

    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: { accept: 'application/json' },
        });
      } catch (err) {
        // Network failure or timeout. Never include `url` (it contains the key).
        this.logger.warn({ endpoint, attempt, errName: (err as Error).name }, 'YouTube API request failed');
        if (attempt < 2) {
          await sleep(this.retryDelayMs);
          continue;
        }
        throw new SourceUnavailableError('YouTube');
      }

      if (response.ok) return (await response.json()) as T;

      if (response.status >= 500 && attempt < 2) {
        this.logger.warn({ endpoint, status: response.status, attempt }, 'YouTube API 5xx, retrying');
        await sleep(this.retryDelayMs);
        continue;
      }
      throw await mapError(response, endpoint);
    }
  }
}

interface RawVideo {
  id: string;
  snippet?: {
    title?: string;
    liveBroadcastContent?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
  contentDetails?: { duration?: string };
}

function toVideoDetails(v: RawVideo): VideoDetails {
  const thumbs = v.snippet?.thumbnails;
  const thumbnailUrl = (thumbs?.high ?? thumbs?.medium ?? thumbs?.default)?.url;
  const durationSeconds = parseIsoDuration(v.contentDetails?.duration);
  return {
    id: v.id,
    title: v.snippet?.title ?? 'Unknown title',
    ...(durationSeconds !== undefined && { durationSeconds }),
    ...(thumbnailUrl !== undefined && { thumbnailUrl }),
    liveBroadcastContent: v.snippet?.liveBroadcastContent ?? 'none',
  };
}

async function mapError(response: Response, endpoint: string): Promise<Error> {
  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Non-JSON error body; fall through with status only.
  }
  const reasons = [
    ...(body.error?.errors ?? []).map((e) => e.reason),
    ...(body.error?.details ?? []).map((d) => d.reason),
  ].filter((r): r is string => !!r);
  const message = body.error?.message ?? '';

  if (reasons.some((r) => ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'].includes(r))) {
    return new QuotaExceededError();
  }
  if (reasons.some((r) => ['accessNotConfigured', 'SERVICE_DISABLED'].includes(r))) {
    return new ApiNotEnabledError();
  }
  if (reasons.includes('API_KEY_INVALID') || reasons.includes('keyInvalid') || /api key not valid/i.test(message)) {
    return new InvalidKeyError("That YouTube API key isn't valid. Double-check you copied the whole key.");
  }
  if (reasons.some((r) => r.startsWith('API_KEY_') && r.endsWith('_BLOCKED')) || reasons.includes('forbidden')) {
    return new InvalidKeyError(
      'That key is restricted so the bot cannot use it. In Google Cloud Console, set its ' +
        '"Application restrictions" to **None** and allow the **YouTube Data API v3**.',
    );
  }
  if (response.status >= 500) return new SourceUnavailableError('YouTube');
  return new AppError(`YouTube API ${endpoint} failed: HTTP ${response.status} (${reasons.join(', ') || 'no reason'})`);
}
