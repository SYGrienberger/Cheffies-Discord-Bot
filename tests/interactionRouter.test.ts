import type { Interaction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { UserError } from '../src/core/errors.js';
import type { Command, CommandContext } from '../src/discord/Command.js';
import { Cooldowns } from '../src/discord/cooldowns.js';
import { createInteractionRouter } from '../src/discord/interactionRouter.js';
import { spyLogger } from './helpers.js';

function slashInteraction(commandName: string, state: { deferred?: boolean; replied?: boolean } = {}) {
  return {
    commandName,
    user: { id: 'u1' },
    guildId: 'g1',
    deferred: state.deferred ?? false,
    replied: state.replied ?? false,
    isChatInputCommand: () => true,
    isModalSubmit: () => false,
    isMessageComponent: () => false,
    isRepliable: () => true,
    reply: vi.fn(async () => {}),
    followUp: vi.fn(async () => {}),
    deleteReply: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
  };
}

function setup(execute: Command['execute'], extra: Partial<Command> = {}) {
  const command: Command = { data: { name: 'test', toJSON: () => ({ name: 'test', description: 'd' }) }, execute, ...extra };
  const logger = spyLogger();
  const ctx = { services: {}, logger } as unknown as CommandContext;
  const route = createInteractionRouter({ commands: new Map([['test', command]]), ctx, cooldowns: new Cooldowns() });
  return { route: (i: unknown) => route(i as Interaction), logger };
}

describe('interactionRouter', () => {
  it('runs the matching command', async () => {
    const execute = vi.fn(async () => {});
    const { route } = setup(execute);
    await route(slashInteraction('test'));
    expect(execute).toHaveBeenCalledOnce();
  });

  it('shows UserError messages privately without logging an error', async () => {
    const { route, logger } = setup(async () => {
      throw new UserError('Join a voice channel first.');
    });
    const interaction = slashInteraction('test');
    await route(interaction);
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'Join a voice channel first.', flags: MessageFlags.Ephemeral });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('hides unexpected errors behind a reference id and logs them', async () => {
    const { route, logger } = setup(async () => {
      throw new Error('database exploded');
    });
    const interaction = slashInteraction('test');
    await route(interaction);
    const reply = interaction.reply.mock.calls[0] as unknown as [{ content: string }];
    expect(reply[0].content).toMatch(/ref: `[0-9a-f]{8}`/);
    expect(reply[0].content).not.toContain('database exploded');
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('replaces a deferred public reply with a private error', async () => {
    const { route } = setup(async () => {
      throw new UserError('nope');
    });
    const interaction = slashInteraction('test', { deferred: true });
    await route(interaction);
    expect(interaction.deleteReply).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith({ content: 'nope', flags: MessageFlags.Ephemeral });
  });

  it('survives a failing error reply', async () => {
    const { route, logger } = setup(async () => {
      throw new UserError('nope');
    });
    const interaction = slashInteraction('test');
    interaction.reply.mockRejectedValueOnce(new Error('Unknown interaction'));
    await expect(route(interaction)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('enforces per-user cooldowns', async () => {
    const execute = vi.fn(async () => {});
    const { route } = setup(execute, { cooldownSeconds: 30 });
    await route(slashInteraction('test'));
    const second = slashInteraction('test');
    await route(second);
    expect(execute).toHaveBeenCalledOnce();
    expect(second.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringMatching(/Try again in 30s/) }));
  });
});
