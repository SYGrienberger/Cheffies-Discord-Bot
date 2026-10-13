import type { ResolveContext, TrackInfo } from '../core/types.js';

/**
 * A place music comes from (YouTube, SoundCloud, ...).
 *
 * To add a source: implement this interface and register it in `container.ts`.
 * MusicService asks each source in order and uses the first whose `canHandle`
 * returns true, so put catch-all sources (free-text search) last.
 */
export interface TrackSource {
  /** Stable identifier, stored on each Track. */
  readonly id: string;
  /** Human-readable name for messages. */
  readonly displayName: string;
  /** When true, MusicService refuses to call `resolve` without `ctx.apiKey`. */
  readonly requiresApiKey: boolean;
  canHandle(input: string): boolean;
  /** Turns a URL or search query into one or more tracks. Throws UserError for user-facing failures. */
  resolve(input: string, ctx: ResolveContext): Promise<TrackInfo[]>;
}
