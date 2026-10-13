/** A playable item as returned by a TrackSource. */
export interface TrackInfo {
  /** Source-specific id (e.g. YouTube video id). */
  id: string;
  title: string;
  /** Canonical URL the AudioStreamer can play. */
  url: string;
  /** Undefined for live streams or when unknown. */
  durationSeconds?: number;
  thumbnailUrl?: string;
  /** Which TrackSource produced it (TrackSource.id). */
  source: string;
}

/** A TrackInfo queued by a specific user. */
export interface Track extends TrackInfo {
  /** Discord user id of whoever requested it. */
  requestedBy: string;
}

/** Context passed to TrackSource.resolve. Add per-user credentials for new sources here. */
export interface ResolveContext {
  userId: string;
  /** The requesting user's decrypted YouTube API key, when the source needs one. */
  apiKey?: string;
}
