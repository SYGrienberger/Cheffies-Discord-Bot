import { InvalidKeyError, UserError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import type { ApiKeyValidator } from '../ports/ApiKeyValidator.js';
import type { Cipher } from '../ports/Cipher.js';
import type { KeyRepository } from '../ports/KeyRepository.js';

/** Google API keys are 39 chars of [A-Za-z0-9_-]; allow some slack for format changes. */
const KEY_FORMAT = /^[A-Za-z0-9_-]{20,100}$/;

export type KeyStatus = { hasKey: false } | { hasKey: true; masked: string; updatedAt: Date };

export interface KeyServiceDeps {
  repo: KeyRepository;
  cipher: Cipher;
  validator: ApiKeyValidator;
  logger: Logger;
}

/**
 * Per-user YouTube API keys: validated before saving, encrypted at rest,
 * decrypted only at the moment a request needs them. Never logs a key.
 */
export class KeyService {
  constructor(private readonly deps: KeyServiceDeps) {}

  async save(userId: string, rawKey: string): Promise<{ masked: string }> {
    const key = rawKey.trim();
    if (!KEY_FORMAT.test(key)) {
      throw new InvalidKeyError(
        "That doesn't look like a Google API key. It should be about 39 letters, numbers, `-` and `_`, usually starting with `AIza`.",
      );
    }
    await this.deps.validator.validate(key);
    await this.deps.repo.set(userId, this.deps.cipher.encrypt(key));
    this.deps.logger.info({ userId }, 'API key saved');
    return { masked: maskKey(key) };
  }

  /** The decrypted key, or undefined if the user has none. */
  async getKey(userId: string): Promise<string | undefined> {
    const stored = await this.deps.repo.get(userId);
    if (!stored) return undefined;
    try {
      return this.deps.cipher.decrypt(stored.encryptedKey);
    } catch (err) {
      // Most likely ENCRYPTION_KEY was changed. The row is useless, so drop it.
      this.deps.logger.error({ userId, err }, 'Stored API key could not be decrypted; removing it');
      await this.deps.repo.delete(userId);
      throw new UserError("Your saved API key can't be read anymore (the bot's encryption key changed). Please run `/setkey` again.");
    }
  }

  async remove(userId: string): Promise<boolean> {
    const removed = await this.deps.repo.delete(userId);
    if (removed) this.deps.logger.info({ userId }, 'API key removed');
    return removed;
  }

  async status(userId: string): Promise<KeyStatus> {
    const stored = await this.deps.repo.get(userId);
    if (!stored) return { hasKey: false };
    const key = await this.getKey(userId);
    if (key === undefined) return { hasKey: false };
    return { hasKey: true, masked: maskKey(key), updatedAt: stored.updatedAt };
  }
}

export function maskKey(key: string): string {
  return `••••••${key.slice(-4)}`;
}
