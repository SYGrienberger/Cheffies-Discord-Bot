import { InteractionContextType, MessageFlags, SlashCommandBuilder, time, TimestampStyles } from 'discord.js';
import { defineCommand } from '../../discord/Command.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('keystatus')
    .setDescription('Check whether you have a YouTube API key saved')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),

  async execute(interaction, { services }) {
    const status = await services.keys.status(interaction.user.id);
    await interaction.reply({
      content: status.hasKey
        ? `🔑 Key saved: \`${status.masked}\` (updated ${time(status.updatedAt, TimestampStyles.RelativeTime)}).`
        : 'No key saved. Use `/setkey` to add your YouTube Data API key.',
      flags: MessageFlags.Ephemeral,
    });
  },
});
