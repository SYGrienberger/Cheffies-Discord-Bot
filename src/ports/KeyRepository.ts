export interface StoredKey {
  userId: string;
  /** Output of Cipher.encrypt — never the plaintext key. */
  encryptedKey: string;
  updatedAt: Date;
}

/** Persists users' encrypted API keys. Async so a network database can implement it. */
export interface KeyRepository {
  get(userId: string): Promise<StoredKey | undefined>;
  /** Insert or replace. */
  set(userId: string, encryptedKey: string): Promise<void>;
  /** Returns true if a key was removed. */
  delete(userId: string): Promise<boolean>;
}
