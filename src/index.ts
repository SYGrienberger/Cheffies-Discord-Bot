import { config as loadEnv } from 'dotenv';
import { Events } from 'discord.js';
import { loadConfig } from './config.js';
import { createContainer } from './container.js';
import { ConfigError } from './core/errors.js';
import { createLogger } from './core/logger.js';
import { attachAnnouncer } from './discord/announcer.js';
import { createClient } from './discord/client.js';
import { loadCommands } from './discord/commandLoader.js';
import { createInteractionRouter } from './discord/interactionRouter.js';
import { createVoiceStateHandler } from './discord/voiceStateHandler.js';
import { installProcessHandlers } from './lifecycle.js';

async function main(): Promise<void> {
  loadEnv({ quiet: true });
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);

  const container = await createContainer(config, logger);
  const commands = await loadCommands();
  logger.info({ commands: [...commands.keys()] }, 'Commands loaded');

  const client = createClient();
  const route = createInteractionRouter({ commands, ctx: { services: container.services, logger } });

  client.on(Events.InteractionCreate, (interaction) => void route(interaction));
  client.on(Events.VoiceStateUpdate, createVoiceStateHandler(container.players));
  client.on(Events.Error, (err) => logger.error({ err }, 'Discord client error'));
  client.on(Events.Warn, (message) => logger.warn(message));
  client.once(Events.ClientReady, (c) => logger.info({ user: c.user.tag, guilds: c.guilds.cache.size }, 'Bot is online'));
  attachAnnouncer(container.players, client, logger);

  installProcessHandlers({
    logger,
    shutdown: async () => {
      container.close();
      await client.destroy();
    },
  });

  await client.login(config.DISCORD_TOKEN);
}

main().catch((err: unknown) => {
  // The logger may not exist yet (e.g. bad config), so use the console here.
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
});
