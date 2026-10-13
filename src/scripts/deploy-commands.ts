import { config as loadEnv } from 'dotenv';
import { REST, Routes } from 'discord.js';
import { loadDeployConfig } from '../config.js';
import { loadCommands } from '../discord/commandLoader.js';

/**
 * Registers slash commands with Discord. Run after adding/changing a command:
 *   npm run deploy
 * With DEV_GUILD_ID set, commands update instantly in that server only;
 * otherwise they're registered globally.
 */
async function main(): Promise<void> {
  loadEnv({ quiet: true });
  const config = loadDeployConfig();
  const commands = await loadCommands();
  const body = [...commands.values()].map((c) => c.data.toJSON());

  const rest = new REST().setToken(config.DISCORD_TOKEN);
  const route = config.DEV_GUILD_ID
    ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DEV_GUILD_ID)
    : Routes.applicationCommands(config.DISCORD_CLIENT_ID);

  await rest.put(route, { body });
  console.log(
    `Registered ${body.length} commands ${config.DEV_GUILD_ID ? `in guild ${config.DEV_GUILD_ID}` : 'globally'}: ` +
      body.map((c) => `/${c.name}`).join(' '),
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
