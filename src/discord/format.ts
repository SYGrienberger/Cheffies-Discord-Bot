import { escapeMarkdown } from 'discord.js';
import type { Track } from '../core/types.js';

/** 3725 → "1:02:05", 65 → "1:05". */
export function formatDuration(totalSeconds: number | undefined): string {
  if (totalSeconds === undefined) return 'live';
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Markdown link to a track with its duration; link previews suppressed. */
export function trackLine(track: Track): string {
  const title = escapeMarkdown(track.title.replace(/[[\]]/g, ''));
  return `[${title}](<${track.url}>) \`${formatDuration(track.durationSeconds)}\``;
}
