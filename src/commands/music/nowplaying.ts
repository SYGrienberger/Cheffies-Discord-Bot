import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../discord/Command.js';
import { formatDuration, trackLine } from '../../discord/format.js';
import { requireGuild } from '../../discord/guards.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show what is playing right now')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, { services }) {
    requireGuild(interaction);
    const np = services.music.nowPlaying(interaction.guildId);
    if (!np) {
      await interaction.reply('Nothing is playing right now.');
      return;
    }
    const elapsed = formatDuration(np.elapsedMs / 1000);
    const total = formatDuration(np.track.durationSeconds);
    await interaction.reply({
      content:
        `${np.paused ? '⏸️' : '🎶'} ${trackLine(np.track)}\n` +
        `\`${elapsed} / ${total}\` · requested by <@${np.track.requestedBy}>`,
      allowedMentions: { parse: [] },
    });
  },
});
