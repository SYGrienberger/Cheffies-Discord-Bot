import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../discord/Command.js';
import { trackLine } from '../../discord/format.js';
import { requireGuild, requireVoiceChannel, toVoiceTarget } from '../../discord/guards.js';
import type { PlayResult } from '../../services/MusicService.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or playlist from YouTube (uses your own API key)')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o.setName('query').setDescription('YouTube link or search words').setRequired(true).setMaxLength(500),
    ),
  cooldownSeconds: 3,

  async execute(interaction, { services }) {
    requireGuild(interaction);
    const channel = requireVoiceChannel(interaction);
    await interaction.deferReply();

    const result = await services.music.play({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      query: interaction.options.getString('query', true),
      voice: toVoiceTarget(channel),
      announceChannelId: interaction.channelId,
    });
    await interaction.editReply({ content: describe(result), allowedMentions: { parse: [] } });
  },
});

function describe(result: PlayResult): string {
  const [first] = result.added;
  if (result.added.length === 1 && first) {
    return result.startsNow ? `▶️ Starting ${trackLine(first)}` : `➕ Queued ${trackLine(first)} at position **#${result.position}**`;
  }
  const dropped = result.resolvedCount - result.added.length;
  return (
    `➕ Added **${result.added.length}** tracks from the playlist` +
    (result.startsNow ? ', starting now' : ` (from position #${result.position})`) +
    (dropped > 0 ? `. ${dropped} didn't fit in the queue.` : '.')
  );
}
