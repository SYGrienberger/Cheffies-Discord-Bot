import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../discord/Command.js';
import { trackLine } from '../../discord/format.js';
import { requireGuild } from '../../discord/guards.js';

const SHOWN = 10;

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current queue')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, { services }) {
    requireGuild(interaction);
    const { nowPlaying, upcoming, total } = services.music.queue(interaction.guildId, SHOWN);
    if (!nowPlaying && total === 0) {
      await interaction.reply('The queue is empty. Add something with `/play`.');
      return;
    }

    const lines: string[] = [];
    if (nowPlaying) lines.push(`**Now playing:** ${trackLine(nowPlaying.track)}${nowPlaying.paused ? ' (paused)' : ''}`);
    if (upcoming.length > 0) {
      lines.push('', '**Up next:**');
      upcoming.forEach((t, i) => lines.push(`${i + 1}. ${trackLine(t)} · <@${t.requestedBy}>`));
      if (total > upcoming.length) lines.push(`…and ${total - upcoming.length} more`);
    }
    await interaction.reply({ content: lines.join('\n'), allowedMentions: { parse: [] } });
  },
});
