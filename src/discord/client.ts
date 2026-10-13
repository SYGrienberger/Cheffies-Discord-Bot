import { Client, GatewayIntentBits } from 'discord.js';

/** Only the intents the bot needs: guilds (commands, channels) and voice states (who's in which channel). */
export function createClient(): Client {
  return new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
}
