import type { KeyRepository, StoredKey } from '../../ports/KeyRepository.js';
import type { SqliteDatabase } from './database.js';

interface Row {
  user_id: string;
  encrypted_key: string;
  updated_at: number;
}

export class SqliteKeyRepository implements KeyRepository {
  private readonly stmts;

  constructor(db: SqliteDatabase) {
    this.stmts = {
      get: db.prepare<[string], Row>('SELECT user_id, encrypted_key, updated_at FROM user_keys WHERE user_id = ?'),
      upsert: db.prepare<[string, string, number, number]>(
        `INSERT INTO user_keys (user_id, encrypted_key, created_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET encrypted_key = excluded.encrypted_key, updated_at = excluded.updated_at`,
      ),
      delete: db.prepare<[string]>('DELETE FROM user_keys WHERE user_id = ?'),
    };
  }

  get(userId: string): Promise<StoredKey | undefined> {
    const row = this.stmts.get.get(userId);
    return Promise.resolve(
      row && { userId: row.user_id, encryptedKey: row.encrypted_key, updatedAt: new Date(row.updated_at) },
    );
  }

  set(userId: string, encryptedKey: string): Promise<void> {
    const now = Date.now();
    this.stmts.upsert.run(userId, encryptedKey, now, now);
    return Promise.resolve();
  }

  delete(userId: string): Promise<boolean> {
    return Promise.resolve(this.stmts.delete.run(userId).changes > 0);
  }
}
