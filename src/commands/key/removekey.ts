import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../discord/Command.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('removekey')
    .setDescription('Delete your saved YouTube API key')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),

  async execute(interaction, { services }) {
    const removed = await services.keys.remove(interaction.user.id);
    await interaction.reply({
      content: removed ? '🗑️ Your API key was deleted.' : "You don't have a saved API key.",
      flags: MessageFlags.Ephemeral,
    });
  },
});
