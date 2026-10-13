import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../discord/Command.js';
import { requireGuild, requireSameChannelAsBot } from '../../discord/guards.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume playback')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, { services }) {
    requireGuild(interaction);
    requireSameChannelAsBot(interaction, services.music.connectedChannelId(interaction.guildId));
    services.music.resume(interaction.guildId);
    await interaction.reply('▶️ Resumed.');
  },
});
