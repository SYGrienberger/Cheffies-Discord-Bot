import { EventEmitter } from 'node:events';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  demuxProbe,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type AudioResource,
  type VoiceConnection,
} from '@discordjs/voice';
import { QueueFullError, UserError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { Track } from '../core/types.js';
import type { AudioStreamHandle, AudioStreamer } from '../ports/AudioStreamer.js';
import { Queue } from './Queue.js';
import type { MusicPlayer, NowPlaying, PlayerEvents, VoiceTarget } from './types.js';

export interface GuildPlayerOptions {
  guildId: string;
  streamer: AudioStreamer;
  logger: Logger;
  /** Leave the channel after this long with nothing playing or nobody listening. */
  idleTimeoutMs: number;
  maxQueueLength: number;
  connectTimeoutMs?: number;
}

interface Current {
  track: Track;
  resource: AudioResource<Track>;
  handle: AudioStreamHandle;
}

/**
 * Owns everything audio for one guild: the queue, the AudioPlayer and the
 * VoiceConnection. Failures stay inside this object: a broken track is skipped,
 * a lost connection destroys only this guild's player.
 *
 * Lifecycle: created on first /play → connect → play tracks → (queue empty or
 * channel empty for idleTimeout | /stop | disconnect) → destroy → 'destroyed'.
 * A destroyed player is never reused; PlayerRegistry makes a fresh one.
 */
export class GuildPlayer extends EventEmitter<PlayerEvents> implements MusicPlayer {
  readonly guildId: string;
  announceChannelId: string | undefined;

  private readonly queue: Queue<Track>;
  private readonly audio: AudioPlayer;
  private readonly log: Logger;
  private connection: VoiceConnection | undefined;
  private current: Current | undefined;
  private advancing = false;
  private destroyed = false;
  private idleTimer: NodeJS.Timeout | undefined;
  private aloneTimer: NodeJS.Timeout | undefined;

  constructor(private readonly opts: GuildPlayerOptions) {
    super();
    this.guildId = opts.guildId;
    this.log = opts.logger;
    this.queue = new Queue(opts.maxQueueLength);
    this.audio = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });

    this.audio.on('stateChange', (oldState, newState) => {
      if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
        this.onTrackFinished();
      }
    });
    this.audio.on('error', (err) => {
      const track = (err.resource as AudioResource<Track>).metadata;
      this.log.warn({ err, trackId: track.id }, 'Playback error');
      this.emit('trackError', track, err);
      // The player goes Idle right after an error, which advances the queue.
    });
  }

  get channelId(): string | undefined {
    return this.connection?.joinConfig.channelId ?? undefined;
  }

  get isActive(): boolean {
    return this.current !== undefined || this.advancing;
  }

  async connect(target: VoiceTarget): Promise<void> {
    this.assertAlive();
    const existing = this.connection;
    if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
      if (existing.joinConfig.channelId === target.channelId) return;
      if (this.isActive) {
        throw new UserError(`I'm already playing in <#${existing.joinConfig.channelId}>. Join me there, or use /stop first.`);
      }
      this.connection = undefined;
      existing.destroy();
    }

    const connection = joinVoiceChannel({
      guildId: target.guildId,
      channelId: target.channelId,
      adapterCreator: target.adapterCreator,
      selfDeaf: true,
    });
    this.connection = connection;
    this.watchConnection(connection);
    connection.subscribe(this.audio);

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, this.opts.connectTimeoutMs ?? 20_000);
    } catch (err) {
      this.log.warn({ err, channelId: target.channelId }, 'Voice connection did not become ready');
      if (this.connection === connection) this.connection = undefined;
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
      if (!this.isActive) this.destroy('could not connect');
      throw new UserError(
        "I couldn't connect to that voice channel. Check that I have permission to join and speak there.",
        { cause: err },
      );
    }
  }

  enqueue(tracks: Track[]): number {
    this.assertAlive();
    const added = this.queue.enqueue(tracks);
    if (added === 0 && tracks.length > 0) throw new QueueFullError('The queue is full. Skip some tracks or try again later.');
    if (!this.isActive) void this.playNext();
    return added;
  }

  skip(): Track | undefined {
    const skipped = this.current?.track;
    // stop() moves the player to Idle, and onTrackFinished starts the next track.
    if (skipped) this.audio.stop(true);
    return skipped;
  }

  pause(): boolean {
    return this.audio.pause();
  }

  resume(): boolean {
    return this.audio.unpause();
  }

  shuffle(): number {
    this.queue.shuffle();
    return this.queue.size;
  }

  nowPlaying(): NowPlaying | undefined {
    if (!this.current) return undefined;
    return {
      track: this.current.track,
      elapsedMs: this.current.resource.playbackDuration,
      paused: this.audio.state.status === AudioPlayerStatus.Paused,
    };
  }

  upcoming(limit: number): { tracks: Track[]; total: number } {
    return { tracks: this.queue.peek(limit), total: this.queue.size };
  }

  setListenersPresent(present: boolean): void {
    if (present) {
      clearTimeout(this.aloneTimer);
      this.aloneTimer = undefined;
    } else if (!this.aloneTimer) {
      this.aloneTimer = setTimeout(() => this.destroy('everyone left the voice channel'), this.opts.idleTimeoutMs);
    }
  }

  destroy(reason: string): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.log.info({ reason }, 'Destroying player');

    clearTimeout(this.idleTimer);
    clearTimeout(this.aloneTimer);
    this.queue.clear();

    const current = this.current;
    this.current = undefined;
    this.audio.stop(true);
    current?.handle.destroy();

    const connection = this.connection;
    this.connection = undefined;
    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();

    this.emit('destroyed', reason);
    this.removeAllListeners();
  }

  /** Starts the next playable track. Tracks that fail to start are reported and skipped. */
  private async playNext(): Promise<void> {
    if (this.advancing || this.destroyed) return;
    this.advancing = true;
    try {
      for (;;) {
        const track = this.queue.next();
        if (!track) {
          this.current = undefined;
          this.emit('queueEnd');
          this.startIdleTimer();
          return;
        }

        let handle: AudioStreamHandle | undefined;
        try {
          handle = await this.opts.streamer.createStream(track);
          const probe = await demuxProbe(handle.stream);
          if (this.destroyed) {
            handle.destroy();
            return;
          }
          const resource = createAudioResource(probe.stream, { inputType: probe.type, metadata: track });
          this.current = { track, resource, handle };
          this.clearIdleTimer();
          this.audio.play(resource);
          this.log.info({ trackId: track.id }, 'Track started');
          this.emit('trackStart', track);
          return;
        } catch (err) {
          handle?.destroy();
          if (this.destroyed) return;
          this.log.warn({ err, trackId: track.id }, 'Could not start track, skipping');
          this.emit('trackError', track, err instanceof Error ? err : new Error(String(err)));
        }
      }
    } finally {
      this.advancing = false;
    }
  }

  private onTrackFinished(): void {
    const finished = this.current;
    this.current = undefined;
    finished?.handle.destroy();
    void this.playNext();
  }

  /** Reconnects after brief network drops; gives up (destroying the player) otherwise. */
  private watchConnection(connection: VoiceConnection): void {
    connection.on('error', (err) => this.log.warn({ err }, 'Voice connection error'));
    connection.on('stateChange', (_old, state) => {
      if (this.connection !== connection) return;
      if (state.status === VoiceConnectionStatus.Disconnected) {
        void this.handleDisconnect(connection);
      } else if (state.status === VoiceConnectionStatus.Destroyed) {
        this.destroy('voice connection destroyed');
      }
    });
  }

  private async handleDisconnect(connection: VoiceConnection): Promise<void> {
    // If Discord is moving us (region change, channel move) the connection goes to
    // Signalling/Connecting by itself. Otherwise we were kicked or lost the network.
    const attempts = [VoiceConnectionStatus.Signalling, VoiceConnectionStatus.Connecting].map((status) =>
      entersState(connection, status, 5_000),
    );
    for (const attempt of attempts) attempt.catch(() => {});
    try {
      await Promise.any(attempts);
    } catch {
      if (this.connection === connection) this.destroy('disconnected from voice');
    }
  }

  private startIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => this.destroy('idle timeout'), this.opts.idleTimeoutMs);
  }

  private clearIdleTimer(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private assertAlive(): void {
    // Callers go through PlayerRegistry, which never hands out a destroyed player.
    if (this.destroyed) throw new Error(`GuildPlayer for ${this.guildId} used after destroy`);
  }
}
