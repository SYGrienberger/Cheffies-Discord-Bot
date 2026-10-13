import { randomUUID } from 'node:crypto';
import { MessageFlags, type Interaction } from 'discord.js';
import { UserError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { commandNameFromCustomId, type Command, type CommandContext } from './Command.js';
import { Cooldowns } from './cooldowns.js';

export interface RouterDeps {
  commands: ReadonlyMap<string, Command>;
  ctx: CommandContext;
  cooldowns?: Cooldowns;
}

/**
 * Dispatches every interaction to its command and is the bot's single error
 * boundary: nothing thrown by a command can escape, and the user always gets
 * an answer.
 */
export function createInteractionRouter(deps: RouterDeps): (interaction: Interaction) => Promise<void> {
  const cooldowns = deps.cooldowns ?? new Cooldowns();
  const { logger } = deps.ctx;

  return async (interaction) => {
    let commandName: string | undefined;
    try {
      if (interaction.isChatInputCommand()) {
        commandName = interaction.commandName;
        const command = deps.commands.get(commandName);
        if (!command) throw new UserError('That command no longer exists. Discord may still be updating its command list.');
        if (command.cooldownSeconds) {
          const wait = cooldowns.hit(`${commandName}:${interaction.user.id}`, command.cooldownSeconds);
          if (wait > 0) throw new UserError(`Slow down a little! Try again in ${wait}s.`);
        }
        await command.execute(interaction, deps.ctx);
      } else if (interaction.isModalSubmit()) {
        commandName = commandNameFromCustomId(interaction.customId);
        const command = deps.commands.get(commandName);
        if (!command?.handleModal) throw new UserError('This form has expired. Run the command again.');
        await command.handleModal(interaction, deps.ctx);
      } else if (interaction.isMessageComponent()) {
        commandName = commandNameFromCustomId(interaction.customId);
        const command = deps.commands.get(commandName);
        if (!command?.handleComponent) throw new UserError('This button has expired. Run the command again.');
        await command.handleComponent(interaction, deps.ctx);
      }
    } catch (err) {
      await reportError(interaction, err, logger, commandName);
    }
  };
}

/** Turns an error into a private reply. UserErrors are shown as-is; anything else gets a reference id. */
export async function reportError(
  interaction: Interaction,
  err: unknown,
  logger: Logger,
  commandName?: string,
): Promise<void> {
  let content: string;
  if (err instanceof UserError) {
    content = err.message;
    logger.debug({ command: commandName, reason: err.message }, 'User error');
  } else {
    const ref = randomUUID().slice(0, 8);
    logger.error(
      { err, ref, command: commandName, userId: interaction.user.id, guildId: interaction.guildId },
      'Unhandled error while handling interaction',
    );
    content = `Something went wrong on my side (ref: \`${ref}\`). Please try again.`;
  }

  if (!interaction.isRepliable()) return;
  try {
    if (interaction.deferred && !interaction.replied) {
      // The deferred reply may be public; swap it for a private error message.
      await interaction.deleteReply().catch(() => {});
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else if (interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch (replyErr) {
    logger.warn({ err: replyErr }, 'Could not send error reply (the interaction probably expired)');
  }
}
