// Toolchain smoke test: proves better-sqlite3's native binary installed and loads on this machine
// (pnpm >= 10 blocks its install script unless pnpm-workspace.yaml allows it). Real schema is Phase 2.
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { tempDir } from './helpers';

describe('better-sqlite3', () => {
  it('opens a file database in WAL mode with foreign keys on', () => {
    const db = new Database(join(tempDir(), 'smoke.sqlite'));
    try {
      expect(db.pragma('journal_mode = WAL', { simple: true })).toBe('wal');
      db.pragma('foreign_keys = ON');
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
      db.prepare('INSERT INTO t (v) VALUES (?)').run('olá');
      expect(db.prepare('SELECT v FROM t').get()).toEqual({ v: 'olá' });
    } finally {
      db.close();
    }
  });
});
