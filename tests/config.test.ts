import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { ConfigError } from '../src/core/errors.js';

const valid = {
  DISCORD_TOKEN: 'token',
  DISCORD_CLIENT_ID: '123456789012345678',
  ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('loadConfig', () => {
  it('applies defaults and treats empty strings as unset', () => {
    const config = loadConfig({ ...valid, DEV_GUILD_ID: '', DB_PATH: '' });
    expect(config.DEV_GUILD_ID).toBeUndefined();
    expect(config.DB_PATH).toBe('./data/bot.db');
    expect(config.IDLE_TIMEOUT_SECONDS).toBe(300);
    expect(config.YTDLP_EXTRA_ARGS).toEqual([]);
  });

  it('splits extra yt-dlp args and coerces numbers', () => {
    const config = loadConfig({ ...valid, YTDLP_EXTRA_ARGS: ' --cookies  /x/c.txt ', MAX_QUEUE_LENGTH: '42' });
    expect(config.YTDLP_EXTRA_ARGS).toEqual(['--cookies', '/x/c.txt']);
    expect(config.MAX_QUEUE_LENGTH).toBe(42);
  });

  it('lists every problem in one readable error', () => {
    expect(() => loadConfig({ DISCORD_CLIENT_ID: 'abc', ENCRYPTION_KEY: 'short' })).toThrowError(ConfigError);
    try {
      loadConfig({ DISCORD_CLIENT_ID: 'abc', ENCRYPTION_KEY: 'short' });
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('DISCORD_TOKEN');
      expect(message).toContain('DISCORD_CLIENT_ID');
      expect(message).toContain('ENCRYPTION_KEY');
    }
  });
});
