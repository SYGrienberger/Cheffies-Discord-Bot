import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../discord/Command.js';
import { requireGuild, requireSameChannelAsBot } from '../../discord/guards.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffle the upcoming tracks')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, { services }) {
    requireGuild(interaction);
    requireSameChannelAsBot(interaction, services.music.connectedChannelId(interaction.guildId));
    const count = services.music.shuffle(interaction.guildId);
    await interaction.reply(`🔀 Shuffled ${count} tracks.`);
  },
});
