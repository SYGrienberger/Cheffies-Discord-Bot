import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { Logger } from '../../core/logger.js';
import type { Track } from '../../core/types.js';
import type { AudioStreamer, AudioStreamHandle } from '../../ports/AudioStreamer.js';

const execFileAsync = promisify(execFile);
const STDERR_LIMIT = 4096;

export interface YtDlpStreamerOptions {
  binaryPath: string;
  logger: Logger;
  /** Extra CLI flags, e.g. `--cookies /path/cookies.txt` for servers YouTube rate-limits. */
  extraArgs?: string[];
  /** How long to wait for the first audio bytes. */
  startTimeoutMs?: number;
}

/**
 * Streams audio by piping `yt-dlp -o -` to stdout. Prefers Opus formats so
 * @discordjs/voice can usually skip transcoding. yt-dlp needs a JavaScript
 * runtime for YouTube, so we hand it the Node binary that runs the bot.
 */
export class YtDlpStreamer implements AudioStreamer {
  constructor(private readonly opts: YtDlpStreamerOptions) {}

  async healthCheck(): Promise<void> {
    try {
      const { stdout } = await execFileAsync(this.opts.binaryPath, ['--version'], { timeout: 15_000 });
      this.opts.logger.info({ version: stdout.trim() }, 'yt-dlp found');
    } catch (err) {
      throw new Error(
        `yt-dlp not found or not runnable at "${this.opts.binaryPath}". ` +
          'Install it (https://github.com/yt-dlp/yt-dlp#installation) or set YTDLP_PATH.',
        { cause: err },
      );
    }
  }

  /**
   * Resolves once yt-dlp has produced its first audio bytes, so a failure
   * (removed video, blocked IP, missing binary) rejects here with yt-dlp's own
   * message instead of turning into a silent, empty track.
   */
  createStream(track: Track): Promise<AudioStreamHandle> {
    const args = [
      '--format', 'bestaudio[acodec=opus]/bestaudio/best',
      '--output', '-',
      '--no-playlist',
      '--no-part',
      '--no-progress',
      '--quiet',
      '--no-warnings',
      '--js-runtimes', `node:${process.execPath}`,
      ...(this.opts.extraArgs ?? []),
      '--',
      track.url,
    ];
    const child = spawn(this.opts.binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = child.stdout;
    const log = this.opts.logger.child({ trackId: track.id });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-STDERR_LIMIT);
    });

    // Stream errors are reported through the start promise or the 'close' log below.
    // This listener only stops an otherwise-unhandled 'error' event from crashing the process.
    stdout.on('error', () => {});

    let destroyed = false;
    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      stdout.destroy();
    };

    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(
        () => fail(new Error(`yt-dlp produced no audio within ${this.startTimeoutMs / 1000}s`)),
        this.startTimeoutMs,
      );

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        destroy();
        reject(err);
      };

      const onReadable = () => {
        if (settled) return;
        if (stdout.readableLength === 0) {
          // 'readable' also fires at end-of-stream; wait for real data or 'close'.
          stdout.once('readable', onReadable);
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({ stream: stdout, destroy });
      };
      stdout.once('readable', onReadable);

      child.on('error', (err) => {
        log.error({ err }, 'yt-dlp failed to start');
        fail(err);
      });
      child.on('close', (code, signal) => {
        if (destroyed || code === 0) {
          fail(new Error('yt-dlp finished without producing audio'));
          return;
        }
        const message = `yt-dlp exited with ${code ?? signal}: ${stderr.trim() || 'no output'}`;
        log.warn({ code, signal, stderr: stderr.trim() }, 'yt-dlp exited abnormally');
        // Before start: reject. After start: end the stream with the error so playback stops cleanly.
        if (settled) stdout.destroy(new Error(message));
        else fail(new Error(message));
      });
    });
  }

  private get startTimeoutMs(): number {
    return this.opts.startTimeoutMs ?? 30_000;
  }
}
