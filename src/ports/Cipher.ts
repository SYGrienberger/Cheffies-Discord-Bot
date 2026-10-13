/** Symmetric encryption for secrets at rest. */
export interface Cipher {
  encrypt(plaintext: string): string;
  /** Throws if the payload was tampered with or encrypted with another key. */
  decrypt(payload: string): string;
}
