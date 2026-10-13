import type { Client } from 'discord.js';
import type { Logger } from '../core/logger.js';
import type { PlayerRegistry } from '../music/PlayerRegistry.js';
import { trackLine } from './format.js';

/** Reasons that are already answered by a command reply, so no announcement is needed. */
const SILENT_LEAVE_REASONS = new Set(['stopped by user', 'shutdown', 'could not connect']);

/** Posts player events ("now playing", skipped tracks, leaving) to the channel /play was used in. */
export function attachAnnouncer(registry: PlayerRegistry, client: Client, logger: Logger): void {
  registry.on('created', (player) => {
    const send = (content: string) => {
      const channelId = player.announceChannelId;
      if (!channelId) return;
      const channel = client.channels.cache.get(channelId);
      if (!channel?.isSendable()) return;
      channel
        .send({ content, allowedMentions: { parse: [] } })
        .catch((err: unknown) => logger.warn({ err, channelId }, 'Could not post announcement'));
    };

    player.on('trackStart', (track) => send(`🎶 Now playing ${trackLine(track)} · requested by <@${track.requestedBy}>`));
    player.on('trackError', (track) => send(`⚠️ Couldn't play ${trackLine(track)}, skipping it.`));
    player.on('destroyed', (reason) => {
      if (!SILENT_LEAVE_REASONS.has(reason)) send(`👋 Left the voice channel (${reason}).`);
    });
  });
}
