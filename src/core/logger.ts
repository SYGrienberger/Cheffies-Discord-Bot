import { pino, type Logger as PinoLogger } from 'pino';

export type Logger = PinoLogger;

/**
 * Structured JSON logger. Fields that could hold secrets are redacted no matter
 * where they appear, so a careless `logger.info({ apiKey })` cannot leak a key.
 * Pipe through `pino-pretty` for human-readable output in development.
 */
export function createLogger(level: string): Logger {
  return pino({
    level,
    redact: {
      paths: ['apiKey', 'key', 'token', 'encryptedKey', '*.apiKey', '*.key', '*.token', '*.encryptedKey'],
      censor: '[redacted]',
    },
  });
}
