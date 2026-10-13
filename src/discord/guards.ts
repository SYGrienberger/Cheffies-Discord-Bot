import { PermissionFlagsBits, type ChatInputCommandInteraction, type VoiceBasedChannel } from 'discord.js';
import { UserError } from '../core/errors.js';
import type { VoiceTarget } from '../music/types.js';

/** Reusable precondition checks for commands. Each throws a UserError when unmet. */

export function requireGuild(
  interaction: ChatInputCommandInteraction,
): asserts interaction is ChatInputCommandInteraction<'cached'> {
  if (!interaction.inCachedGuild()) throw new UserError('This command only works inside a server.');
}

export function requireVoiceChannel(interaction: ChatInputCommandInteraction<'cached'>): VoiceBasedChannel {
  const channel = interaction.member.voice.channel;
  if (!channel) throw new UserError('Join a voice channel first.');
  const me = interaction.guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
    throw new UserError(`I need permission to **connect** and **speak** in ${channel.toString()}.`);
  }
  return channel;
}

/** Playback controls only work for people listening in the bot's channel. */
export function requireSameChannelAsBot(
  interaction: ChatInputCommandInteraction<'cached'>,
  botChannelId: string | undefined,
): void {
  if (botChannelId && interaction.member.voice.channelId !== botChannelId) {
    throw new UserError(`Join <#${botChannelId}> to control the music.`);
  }
}

export function toVoiceTarget(channel: VoiceBasedChannel): VoiceTarget {
  return { guildId: channel.guild.id, channelId: channel.id, adapterCreator: channel.guild.voiceAdapterCreator };
}
