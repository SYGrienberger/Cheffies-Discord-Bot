import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Cipher } from '../../ports/Cipher.js';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM with a random IV per message. The auth tag makes tampering detectable.
 * Payload format: `v1.<iv>.<tag>.<ciphertext>` (base64url parts). The version prefix
 * leaves room for key rotation or algorithm changes later.
 */
export class AesGcmCipher implements Cipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('AesGcmCipher needs a 32-byte key');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv, tag, ciphertext].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, ciphertext] = payload.split('.');
    if (version !== VERSION || iv === undefined || tag === undefined || ciphertext === undefined) {
      throw new Error('Unrecognised encrypted payload format');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  }
}
