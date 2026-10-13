import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../discord/Command.js';
import { requireGuild, requireSameChannelAsBot } from '../../discord/guards.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback, clear the queue and leave the voice channel')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, { services }) {
    requireGuild(interaction);
    requireSameChannelAsBot(interaction, services.music.connectedChannelId(interaction.guildId));
    services.music.stop(interaction.guildId);
    await interaction.reply('⏹️ Stopped and cleared the queue.');
  },
});
