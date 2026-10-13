/**
 * Schema migrations, applied in order at startup. The database's
 * `PRAGMA user_version` records how many have run.
 *
 * Never edit or reorder an existing entry: append a new one.
 */
export const migrations: readonly string[] = [
  // 1: per-user encrypted API keys
  `CREATE TABLE user_keys (
     user_id       TEXT PRIMARY KEY,
     encrypted_key TEXT NOT NULL,
     created_at    INTEGER NOT NULL,
     updated_at    INTEGER NOT NULL
   ) STRICT;`,
];
