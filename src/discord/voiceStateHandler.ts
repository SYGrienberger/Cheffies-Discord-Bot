import type { VoiceState } from 'discord.js';
import type { PlayerLookup } from '../music/types.js';

/** Tells a guild's player whether anyone (non-bot) is still listening, so it can leave an empty channel. */
export function createVoiceStateHandler(players: PlayerLookup) {
  return (oldState: VoiceState, newState: VoiceState): void => {
    const player = players.get(newState.guild.id);
    const channelId = player?.channelId;
    if (!player || !channelId) return;
    if (oldState.channelId !== channelId && newState.channelId !== channelId) return;

    const channel = newState.guild.channels.cache.get(channelId);
    if (!channel?.isVoiceBased()) return;
    player.setListenersPresent(channel.members.some((m) => !m.user.bot));
  };
}
