import { describe, expect, it } from 'vitest';
import { AesGcmCipher } from '../src/adapters/crypto/AesGcmCipher.js';
import { testKey } from './helpers.js';

describe('AesGcmCipher', () => {
  const cipher = new AesGcmCipher(testKey());

  it('round-trips', () => {
    expect(cipher.decrypt(cipher.encrypt('AIza-secret'))).toBe('AIza-secret');
  });

  it('uses a fresh IV every time and never contains the plaintext', () => {
    const a = cipher.encrypt('same');
    const b = cipher.encrypt('same');
    expect(a).not.toBe(b);
    expect(a).not.toContain('same');
    expect(a.startsWith('v1.')).toBe(true);
  });

  it('detects tampering', () => {
    const parts = cipher.encrypt('secret value').split('.');
    const ct = Buffer.from(parts[3]!, 'base64url');
    ct[0] = ct[0]! ^ 0xff;
    parts[3] = ct.toString('base64url');
    expect(() => cipher.decrypt(parts.join('.'))).toThrow();
  });

  it('cannot be decrypted with a different key', () => {
    const other = new AesGcmCipher(testKey());
    expect(() => other.decrypt(cipher.encrypt('secret'))).toThrow();
  });

  it('rejects malformed payloads and bad key sizes', () => {
    expect(() => cipher.decrypt('garbage')).toThrow(/format/);
    expect(() => new AesGcmCipher(Buffer.alloc(16))).toThrow(/32-byte/);
  });
});
