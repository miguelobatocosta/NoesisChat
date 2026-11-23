import { copyFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAIN_ROOM_ID } from '@pausa/shared';
import { MIGRATIONS_DIR, migrate, nextSeq, openDatabase } from '../src/db';
import { tempDir } from './helpers';

describe('migrations', () => {
  it('create the schema, seed #geral, and are idempotent', () => {
    const file = join(tempDir(), 'db.sqlite');
    const db = openDatabase(file);
    expect(db.prepare('SELECT slug, is_main FROM rooms WHERE id = ?').get(MAIN_ROOM_ID)).toEqual({
      slug: 'geral',
      is_main: 1,
    });
    migrate(db); // second run is a no-op
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toEqual({
      n: readdirSync(MIGRATIONS_DIR).length,
    });
    db.close();
  });

  it('refuse to start if an applied migration was edited (CLAUDE.md rule 10)', () => {
    const dir = tempDir();
    for (const f of readdirSync(MIGRATIONS_DIR))
      copyFileSync(join(MIGRATIONS_DIR, f), join(dir, f));
    const db = openDatabase(join(tempDir(), 'db.sqlite'), dir);
    writeFileSync(join(dir, '0001_init.sql'), '-- tampered\n');
    expect(() => migrate(db, dir)).toThrow(/modified after being applied/);
    db.close();
  });

  it('apply new numbered files in order', () => {
    const dir = tempDir();
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(MIGRATIONS_DIR))
      copyFileSync(join(MIGRATIONS_DIR, f), join(dir, f));
    writeFileSync(join(dir, '0002_extra.sql'), 'CREATE TABLE extra (id INTEGER);');
    const db = openDatabase(join(tempDir(), 'db.sqlite'), dir);
    expect(db.prepare(`SELECT name FROM sqlite_master WHERE name = 'extra'`).get()).toEqual({
      name: 'extra',
    });
    db.close();
  });

  it('the change sequence only goes up', () => {
    const db = openDatabase(':memory:');
    const a = nextSeq(db);
    const b = nextSeq(db);
    expect(b).toBe(a + 1);
    db.close();
  });
});
