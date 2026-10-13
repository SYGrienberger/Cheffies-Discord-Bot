import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { Logger } from '../core/logger.js';
import type { Services } from '../services/index.js';

export interface CommandContext {
  services: Services;
  logger: Logger;
}

/**
 * A slash command. Each file in `src/commands/` default-exports one, and the
 * loader registers it automatically.
 *
 * Commands should stay thin: read options, call a service, format the reply.
 * Throw a `UserError` for anything the user should see. The router turns
 * every error into a reply, so commands never need their own try/catch.
 */
export interface Command {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  /** Per-user cooldown, enforced by the router. */
  cooldownSeconds?: number;
  execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void>;
  /** Handles modals whose customId starts with `<command name>:` (build ids with `customId()`). */
  handleModal?(interaction: ModalSubmitInteraction, ctx: CommandContext): Promise<void>;
  /** Handles buttons/selects whose customId starts with `<command name>:`. */
  handleComponent?(interaction: MessageComponentInteraction, ctx: CommandContext): Promise<void>;
}

/** Identity helper that gives command files full type checking. */
export function defineCommand(command: Command): Command {
  return command;
}

/** Builds a component/modal customId that the router sends back to `command`. */
export function customId(command: string, action: string): string {
  return `${command}:${action}`;
}

export function commandNameFromCustomId(id: string): string {
  return id.split(':', 1)[0] ?? '';
}
