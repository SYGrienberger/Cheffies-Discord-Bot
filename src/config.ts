import { z } from 'zod';
import { ConfigError } from './core/errors.js';

/** Treats empty strings (e.g. `DEV_GUILD_ID=` in .env) as "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const snowflake = z.string().regex(/^\d{17,20}$/, 'must be a Discord ID (digits only)');

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'is required'),
  DISCORD_CLIENT_ID: snowflake,
  DEV_GUILD_ID: optional(snowflake),
  ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'must be 32 random bytes encoded as base64 (generate with: openssl rand -base64 32)',
    ),
  DB_PATH: optional(z.string()).default('./data/bot.db'),
  LOG_LEVEL: optional(z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])).default('info'),
  YTDLP_PATH: optional(z.string()).default('yt-dlp'),
  /** Space-separated extra yt-dlp flags, e.g. "--cookies /data/cookies.txt". */
  YTDLP_EXTRA_ARGS: optional(z.string())
    .default('')
    .transform((v) => v.split(/\s+/).filter(Boolean)),
  IDLE_TIMEOUT_SECONDS: optional(z.coerce.number().int().min(10)).default(300),
  MAX_PLAYLIST_ITEMS: optional(z.coerce.number().int().min(1).max(500)).default(50),
  MAX_QUEUE_LENGTH: optional(z.coerce.number().int().min(1).max(5000)).default(500),
});

export type Config = z.infer<typeof schema>;

/** Validates the environment once at boot. Throws a readable ConfigError listing every problem. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return parse(schema, env);
}

/** Subset needed by the command deploy script (no encryption key required). */
export function loadDeployConfig(env: NodeJS.ProcessEnv = process.env) {
  return parse(schema.pick({ DISCORD_TOKEN: true, DISCORD_CLIENT_ID: true, DEV_GUILD_ID: true }), env);
}

function parse<T extends z.ZodType>(s: T, env: NodeJS.ProcessEnv): z.infer<T> {
  const result = s.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new ConfigError(`Invalid configuration (check your .env):\n${lines.join('\n')}`);
  }
  return result.data;
}
