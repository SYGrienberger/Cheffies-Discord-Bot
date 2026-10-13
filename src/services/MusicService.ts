import { KeyMissingError, SourceError, UserError } from '../core/errors.js';
import type { Track } from '../core/types.js';
import type { MusicPlayer, NowPlaying, PlayerLookup, VoiceTarget } from '../music/types.js';
import type { TrackSource } from '../ports/TrackSource.js';
import type { KeyService } from './KeyService.js';

export interface PlayRequest {
  guildId: string;
  userId: string;
  query: string;
  voice: VoiceTarget;
  /** Text channel to post "now playing" updates in. */
  announceChannelId?: string;
}

export interface PlayResult {
  /** Tracks actually queued (may be fewer than resolved if the queue filled up). */
  added: Track[];
  /** How many tracks the input resolved to. */
  resolvedCount: number;
  /** True if nothing was playing, so the first added track starts right away. */
  startsNow: boolean;
  /** 1-based queue position of the first added track (0 when it starts now). */
  position: number;
  sourceName: string;
}

export interface MusicServiceDeps {
  /** Asked in order; the first whose canHandle() matches wins. */
  sources: readonly TrackSource[];
  keys: Pick<KeyService, 'getKey'>;
  players: PlayerLookup;
}

/** Use cases behind the music commands. Knows nothing about Discord interactions. */
export class MusicService {
  constructor(private readonly deps: MusicServiceDeps) {}

  async play(req: PlayRequest): Promise<PlayResult> {
    const query = req.query.trim();
    if (!query) throw new UserError('Tell me what to play: a YouTube link or some search words.');

    const source = this.deps.sources.find((s) => s.canHandle(query));
    if (!source) throw new SourceError("I can't play links from that site. Try a YouTube link or search words.");

    let apiKey: string | undefined;
    if (source.requiresApiKey) {
      apiKey = await this.deps.keys.getKey(req.userId);
      if (!apiKey) throw new KeyMissingError();
    }

    // Resolve before joining voice, so a bad query never makes the bot join for nothing.
    const infos = await source.resolve(query, { userId: req.userId, ...(apiKey !== undefined && { apiKey }) });
    if (infos.length === 0) throw new SourceError('Nothing found to play.');

    const player = this.deps.players.getOrCreate(req.guildId);
    await player.connect(req.voice);
    if (req.announceChannelId) player.announceChannelId = req.announceChannelId;

    const startsNow = !player.isActive;
    const queuedBefore = player.upcoming(0).total;
    const tracks: Track[] = infos.map((info) => ({ ...info, requestedBy: req.userId }));
    const addedCount = player.enqueue(tracks);

    return {
      added: tracks.slice(0, addedCount),
      resolvedCount: tracks.length,
      startsNow,
      position: startsNow ? 0 : queuedBefore + 1,
      sourceName: source.displayName,
    };
  }

  skip(guildId: string): Track {
    const skipped = this.activePlayer(guildId).skip();
    if (!skipped) throw new UserError('Nothing is playing right now.');
    return skipped;
  }

  /** Clears the queue and leaves the voice channel. */
  stop(guildId: string): void {
    const player = this.deps.players.get(guildId);
    if (!player) throw new UserError("I'm not in a voice channel.");
    player.destroy('stopped by user');
  }

  pause(guildId: string): void {
    if (!this.activePlayer(guildId).pause()) throw new UserError('Already paused.');
  }

  resume(guildId: string): void {
    if (!this.activePlayer(guildId).resume()) throw new UserError("I'm not paused.");
  }

  shuffle(guildId: string): number {
    const count = this.activePlayer(guildId).shuffle();
    if (count < 2) throw new UserError('Need at least two queued tracks to shuffle.');
    return count;
  }

  nowPlaying(guildId: string): NowPlaying | undefined {
    return this.deps.players.get(guildId)?.nowPlaying();
  }

  queue(guildId: string, limit: number): { nowPlaying: NowPlaying | undefined; upcoming: Track[]; total: number } {
    const player = this.deps.players.get(guildId);
    const { tracks, total } = player?.upcoming(limit) ?? { tracks: [], total: 0 };
    return { nowPlaying: player?.nowPlaying(), upcoming: tracks, total };
  }

  /** Voice channel the bot is in for this guild, if any. */
  connectedChannelId(guildId: string): string | undefined {
    return this.deps.players.get(guildId)?.channelId;
  }

  private activePlayer(guildId: string): MusicPlayer {
    const player = this.deps.players.get(guildId);
    if (!player?.isActive) throw new UserError('Nothing is playing right now.');
    return player;
  }
}
