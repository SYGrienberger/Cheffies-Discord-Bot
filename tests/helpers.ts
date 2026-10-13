import { randomBytes } from 'node:crypto';
import { vi } from 'vitest';
import { createLogger, type Logger } from '../src/core/logger.js';

export const silentLogger = (): Logger => createLogger('silent');

/** A logger whose methods are spies, for asserting what got logged. */
export function spyLogger(): Logger {
  const logger = createLogger('silent');
  for (const level of ['error', 'warn', 'info', 'debug'] as const) vi.spyOn(logger, level);
  return logger;
}

export const testKey = (): Buffer => randomBytes(32);

/** A plausible-looking (fake) Google API key. */
export const FAKE_API_KEY = 'AIzaSyA1234567890abcdefghijklmnopqrstuv';
