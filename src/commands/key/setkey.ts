import {
  InteractionContextType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { customId, defineCommand } from '../../discord/Command.js';

const NAME = 'setkey';
const MODAL_ID = customId(NAME, 'submit');
const KEY_FIELD = 'apiKey';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName(NAME)
    .setDescription('Save your own YouTube Data API key (private, encrypted)')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),
  cooldownSeconds: 5,

  // The key is typed into a modal, so it never appears in chat history.
  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId(MODAL_ID)
      .setTitle('Your YouTube API key')
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('YouTube Data API v3 key')
          .setDescription('Google Cloud Console → APIs & Services → Credentials')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId(KEY_FIELD)
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('AIza…')
              .setMinLength(20)
              .setMaxLength(100)
              .setRequired(true),
          ),
      );
    await interaction.showModal(modal);
  },

  async handleModal(interaction, { services }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { masked } = await services.keys.save(interaction.user.id, interaction.fields.getTextInputValue(KEY_FIELD));
    await interaction.editReply(
      `✅ Key saved (\`${masked}\`). It's stored encrypted and only used for your own \`/play\` requests.\n` +
        'Remove it any time with `/removekey`.',
    );
  },
});
