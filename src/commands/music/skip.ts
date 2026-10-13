import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../discord/Command.js';
import { trackLine } from '../../discord/format.js';
import { requireGuild, requireSameChannelAsBot } from '../../discord/guards.js';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, { services }) {
    requireGuild(interaction);
    requireSameChannelAsBot(interaction, services.music.connectedChannelId(interaction.guildId));
    const skipped = services.music.skip(interaction.guildId);
    await interaction.reply({ content: `⏭️ Skipped ${trackLine(skipped)}`, allowedMentions: { parse: [] } });
  },
});
