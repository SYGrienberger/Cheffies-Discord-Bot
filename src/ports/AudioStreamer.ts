import type { Readable } from 'node:stream';
import type { Track } from '../core/types.js';

export interface AudioStreamHandle {
  /** Raw audio bytes (any container ffmpeg understands; Ogg/WebM Opus avoids transcoding). */
  stream: Readable;
  /** Stops the underlying download/process. Safe to call more than once. */
  destroy(): void;
}

/** Turns a Track into an audio byte stream. */
export interface AudioStreamer {
  createStream(track: Track): Promise<AudioStreamHandle>;
  /** Throws with a clear message if the streamer cannot work (e.g. binary missing). Called at boot. */
  healthCheck(): Promise<void>;
}
