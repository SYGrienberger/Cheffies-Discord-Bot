import { describe, expect, it, vi } from 'vitest';
import { AesGcmCipher } from '../src/adapters/crypto/AesGcmCipher.js';
import { openDatabase } from '../src/adapters/storage/database.js';
import { SqliteKeyRepository } from '../src/adapters/storage/SqliteKeyRepository.js';
import { InvalidKeyError, QuotaExceededError, UserError } from '../src/core/errors.js';
import { KeyService } from '../src/services/KeyService.js';
import { FAKE_API_KEY, silentLogger, testKey } from './helpers.js';

function setup(validate: (key: string) => Promise<void> = async () => {}) {
  const repo = new SqliteKeyRepository(openDatabase(':memory:'));
  const cipher = new AesGcmCipher(testKey());
  const validator = { validate: vi.fn(validate) };
  const service = new KeyService({ repo, cipher, validator, logger: silentLogger() });
  return { repo, cipher, validator, service };
}

describe('KeyService', () => {
  it('validates, encrypts and stores a key', async () => {
    const { service, repo, validator } = setup();
    const { masked } = await service.save('u1', `  ${FAKE_API_KEY}  `);

    expect(validator.validate).toHaveBeenCalledWith(FAKE_API_KEY);
    expect(masked).toBe(`••••••${FAKE_API_KEY.slice(-4)}`);
    expect((await repo.get('u1'))?.encryptedKey).not.toContain(FAKE_API_KEY);
    expect(await service.getKey('u1')).toBe(FAKE_API_KEY);
  });

  it('rejects obviously malformed keys without calling the API', async () => {
    const { service, validator } = setup();
    await expect(service.save('u1', 'not a key!')).rejects.toBeInstanceOf(InvalidKeyError);
    expect(validator.validate).not.toHaveBeenCalled();
  });

  it('stores nothing when validation fails', async () => {
    const { service, repo } = setup(async () => {
      throw new QuotaExceededError();
    });
    await expect(service.save('u1', FAKE_API_KEY)).rejects.toBeInstanceOf(QuotaExceededError);
    expect(await repo.get('u1')).toBeUndefined();
  });

  it('reports status with a masked key', async () => {
    const { service } = setup();
    expect(await service.status('u1')).toEqual({ hasKey: false });
    await service.save('u1', FAKE_API_KEY);
    expect(await service.status('u1')).toMatchObject({ hasKey: true, masked: `••••••${FAKE_API_KEY.slice(-4)}` });
  });

  it('removes keys', async () => {
    const { service } = setup();
    await service.save('u1', FAKE_API_KEY);
    expect(await service.remove('u1')).toBe(true);
    expect(await service.getKey('u1')).toBeUndefined();
  });

  it('drops a key that can no longer be decrypted and asks the user to re-add it', async () => {
    const { service, repo } = setup();
    await repo.set('u1', new AesGcmCipher(testKey()).encrypt(FAKE_API_KEY)); // encrypted with another key
    await expect(service.getKey('u1')).rejects.toBeInstanceOf(UserError);
    expect(await repo.get('u1')).toBeUndefined();
  });
});
