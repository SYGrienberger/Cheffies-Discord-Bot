import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, runMigrations, type SqliteDatabase } from '../src/adapters/storage/database.js';
import { migrations } from '../src/adapters/storage/migrations.js';
import { SqliteKeyRepository } from '../src/adapters/storage/SqliteKeyRepository.js';

describe('SqliteKeyRepository', () => {
  let db: SqliteDatabase;
  let repo: SqliteKeyRepository;

  beforeEach(() => {
    db = openDatabase(':memory:');
    repo = new SqliteKeyRepository(db);
  });

  it('stores, replaces and deletes keys', async () => {
    expect(await repo.get('u1')).toBeUndefined();

    await repo.set('u1', 'enc-1');
    expect((await repo.get('u1'))?.encryptedKey).toBe('enc-1');

    await repo.set('u1', 'enc-2');
    const stored = await repo.get('u1');
    expect(stored?.encryptedKey).toBe('enc-2');
    expect(stored?.updatedAt).toBeInstanceOf(Date);

    expect(await repo.delete('u1')).toBe(true);
    expect(await repo.delete('u1')).toBe(false);
    expect(await repo.get('u1')).toBeUndefined();
  });

  it('runs migrations once and records the version', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(migrations.length);
    expect(() => runMigrations(db)).not.toThrow();
  });

  it('refuses a database from a newer build', () => {
    db.pragma(`user_version = ${migrations.length + 1}`);
    expect(() => runMigrations(db)).toThrow(/newer/);
  });
});
