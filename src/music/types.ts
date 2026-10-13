import type { DiscordGatewayAdapterCreator } from '@discordjs/voice';
import type { Track } from '../core/types.js';

/** Where to connect. `adapterCreator` comes from `guild.voiceAdapterCreator`. */
export interface VoiceTarget {
  guildId: string;
  channelId: string;
  adapterCreator: DiscordGatewayAdapterCreator;
}

export interface NowPlaying {
  track: Track;
  /** Milliseconds played so far. */
  elapsedMs: number;
  paused: boolean;
}

export interface PlayerEvents {
  trackStart: [track: Track];
  trackError: [track: Track, error: Error];
  queueEnd: [];
  destroyed: [reason: string];
}

/**
 * What services need from a guild's player. GuildPlayer implements it;
 * tests use a fake.
 */
export interface MusicPlayer {
  readonly guildId: string;
  /** Voice channel the bot is in, if connected. */
  readonly channelId: string | undefined;
  /** Text channel for "now playing" announcements. */
  announceChannelId: string | undefined;
  readonly isActive: boolean;
  connect(target: VoiceTarget): Promise<void>;
  /** Returns how many tracks fit in the queue. Starts playback if idle. */
  enqueue(tracks: Track[]): number;
  skip(): Track | undefined;
  pause(): boolean;
  resume(): boolean;
  shuffle(): number;
  nowPlaying(): NowPlaying | undefined;
  upcoming(limit: number): { tracks: Track[]; total: number };
  /** Starts/cancels the "everyone left the channel" timer. */
  setListenersPresent(present: boolean): void;
  destroy(reason: string): void;
}

export interface PlayerLookup {
  get(guildId: string): MusicPlayer | undefined;
  getOrCreate(guildId: string): MusicPlayer;
}
