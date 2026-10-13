import { KeyMissingError, SourceError } from '../../../core/errors.js';
import type { ResolveContext, TrackInfo } from '../../../core/types.js';
import type { TrackSource } from '../../../ports/TrackSource.js';
import { isUrl, isYouTubeUrl, parseYouTubeInput } from './parse.js';
import type { VideoDetails, YouTubeApiClient } from './YouTubeApiClient.js';

export interface YouTubeSourceOptions {
  maxPlaylistItems: number;
}

/**
 * Resolves YouTube links and free-text searches using the requesting user's API key.
 * Also handles any non-URL text, so register it last.
 */
export class YouTubeSource implements TrackSource {
  readonly id = 'youtube';
  readonly displayName = 'YouTube';
  readonly requiresApiKey = true;

  constructor(
    private readonly api: Pick<YouTubeApiClient, 'searchVideoIds' | 'getVideos' | 'getPlaylistVideoIds'>,
    private readonly options: YouTubeSourceOptions,
  ) {}

  canHandle(input: string): boolean {
    return !isUrl(input) || isYouTubeUrl(input);
  }

  async resolve(input: string, ctx: ResolveContext): Promise<TrackInfo[]> {
    const apiKey = ctx.apiKey;
    if (!apiKey) throw new KeyMissingError();

    const parsed = parseYouTubeInput(input);
    if (!parsed) throw new SourceError("I can't play that YouTube link. Send a video or playlist link.");

    switch (parsed.kind) {
      case 'video': {
        const videos = await this.api.getVideos(apiKey, [parsed.videoId]);
        const playable = videos.filter(isPlayable);
        if (playable.length === 0) throw new SourceError('That video is private, removed, or not playable.');
        return playable.map(toTrackInfo);
      }
      case 'playlist': {
        const ids = await this.api.getPlaylistVideoIds(apiKey, parsed.playlistId, this.options.maxPlaylistItems);
        const playable = (await this.api.getVideos(apiKey, ids)).filter(isPlayable);
        if (playable.length === 0) throw new SourceError('That playlist is empty, private, or has no playable videos.');
        return playable.map(toTrackInfo);
      }
      case 'search': {
        const ids = await this.api.searchVideoIds(apiKey, parsed.query, 5);
        // Search can return videos that turn out to be unplayable; take the first that isn't.
        const first = (await this.api.getVideos(apiKey, ids)).find(isPlayable);
        if (!first) throw new SourceError(`No results on YouTube for "${parsed.query}".`);
        return [toTrackInfo(first)];
      }
    }
  }
}

function isPlayable(v: VideoDetails): boolean {
  return v.liveBroadcastContent !== 'upcoming';
}

function toTrackInfo(v: VideoDetails): TrackInfo {
  return {
    id: v.id,
    title: v.title,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    source: 'youtube',
    ...(v.durationSeconds !== undefined && { durationSeconds: v.durationSeconds }),
    ...(v.thumbnailUrl !== undefined && { thumbnailUrl: v.thumbnailUrl }),
  };
}
