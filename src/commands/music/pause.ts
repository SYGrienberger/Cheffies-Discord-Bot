import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../discord/Command.js';
import { requireGuild, requireSameChannelAsBot } from '../../discord/guards.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current track')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, { services }) {
    requireGuild(interaction);
    requireSameChannelAsBot(interaction, services.music.connectedChannelId(interaction.guildId));
    services.music.pause(interaction.guildId);
    await interaction.reply('⏸️ Paused. Use `/resume` to continue.');
  },
});
