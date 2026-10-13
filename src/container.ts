import { generateDependencyReport } from '@discordjs/voice';
import prism from 'prism-media';
import { AesGcmCipher } from './adapters/crypto/AesGcmCipher.js';
import { YouTubeApiClient } from './adapters/sources/youtube/YouTubeApiClient.js';
import { YouTubeSource } from './adapters/sources/youtube/YouTubeSource.js';
import { openDatabase } from './adapters/storage/database.js';
import { SqliteKeyRepository } from './adapters/storage/SqliteKeyRepository.js';
import { YtDlpStreamer } from './adapters/streaming/YtDlpStreamer.js';
import type { Config } from './config.js';
import type { Logger } from './core/logger.js';
import { GuildPlayer } from './music/GuildPlayer.js';
import { PlayerRegistry } from './music/PlayerRegistry.js';
import type { TrackSource } from './ports/TrackSource.js';
import type { Services } from './services/index.js';
import { KeyService } from './services/KeyService.js';
import { MusicService } from './services/MusicService.js';

export interface Container {
  services: Services;
  players: PlayerRegistry;
  /** Leaves all voice channels and closes the database. */
  close(): void;
}

/**
 * Composition root: the only place that knows which concrete adapter backs
 * each port. To swap storage or add a music source, change this file.
 */
export async function createContainer(config: Config, logger: Logger): Promise<Container> {
  const db = openDatabase(config.DB_PATH);
  try {
    const cipher = new AesGcmCipher(Buffer.from(config.ENCRYPTION_KEY, 'base64'));
    const youtube = new YouTubeApiClient({ logger: logger.child({ module: 'youtube' }) });

    const keys = new KeyService({
      repo: new SqliteKeyRepository(db),
      cipher,
      validator: youtube,
      logger: logger.child({ module: 'keys' }),
    });

    const streamer = new YtDlpStreamer({
      binaryPath: config.YTDLP_PATH,
      extraArgs: config.YTDLP_EXTRA_ARGS,
      logger: logger.child({ module: 'yt-dlp' }),
    });
    await streamer.healthCheck();
    checkFfmpeg();
    logger.debug(generateDependencyReport());

    // Order matters: the first source whose canHandle() matches wins.
    // YouTubeSource also handles plain search text, so keep it last.
    const sources: TrackSource[] = [new YouTubeSource(youtube, { maxPlaylistItems: config.MAX_PLAYLIST_ITEMS })];

    const players = new PlayerRegistry(
      (guildId) =>
        new GuildPlayer({
          guildId,
          streamer,
          logger: logger.child({ module: 'player', guildId }),
          idleTimeoutMs: config.IDLE_TIMEOUT_SECONDS * 1000,
          maxQueueLength: config.MAX_QUEUE_LENGTH,
        }),
    );

    const music = new MusicService({ sources, keys, players });

    return {
      services: { keys, music },
      players,
      close() {
        players.destroyAll('shutdown');
        db.close();
      },
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/** Non-Opus streams are transcoded with FFmpeg; fail at boot rather than on the first song. */
function checkFfmpeg(): void {
  try {
    prism.FFmpeg.getInfo();
  } catch (err) {
    throw new Error('FFmpeg not found. Run `npm install` (ffmpeg-static) or install ffmpeg on the PATH.', {
      cause: err,
    });
  }
}
