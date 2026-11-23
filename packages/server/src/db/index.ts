import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { REPO_ROOT } from '../config';

export type Db = Database.Database;

export const MIGRATIONS_DIR = join(REPO_ROOT, 'packages', 'server', 'migrations');

/** Opens (creating if needed) the SQLite database with the pragmas from SPEC §8, then migrates. */
export function openDatabase(file: string, migrationsDir = MIGRATIONS_DIR): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  migrate(db, migrationsDir);
  return db;
}

/**
 * Applies numbered migrations in order. Each applied migration's checksum is stored; if a file
 * changes after being applied, startup fails (CLAUDE.md rule 10: never mutate an applied migration).
 */
export function migrate(db: Db, dir = MIGRATIONS_DIR): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)`);

  const applied = new Map(
    db
      .prepare('SELECT version, checksum FROM schema_migrations')
      .all()
      .map((r) => [(r as { version: number }).version, (r as { checksum: string }).checksum]),
  );

  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
    .sort();

  for (const file of files) {
    const version = Number(file.slice(0, 4));
    const sql = readFileSync(join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const known = applied.get(version);
    if (known) {
      if (known !== checksum)
        throw new Error(`Migration ${file} was modified after being applied.`);
      continue;
    }
    db.transaction(() => {
      db.exec(sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
      ).run(version, file, checksum, Date.now());
    })();
  }
}

/** Next value of the global change sequence (D-33). Call inside the mutation's transaction. */
export function nextSeq(db: Db): number {
  const row = db
    .prepare(
      `UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'change_seq'
       RETURNING CAST(value AS INTEGER) AS v`,
    )
    .get() as { v: number };
  return row.v;
}

export function currentSeq(db: Db): number {
  const row = db
    .prepare(`SELECT CAST(value AS INTEGER) AS v FROM settings WHERE key = 'change_seq'`)
    .get() as {
    v: number;
  };
  return row.v;
}

/** `IN (?, ?, …)` placeholder list. */
export function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ');
}
