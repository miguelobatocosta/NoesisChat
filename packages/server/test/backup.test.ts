import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAIN_ROOM_ID } from '@pausa/shared';
import { buildApp } from '../src/app';
import { KEEP, runBackup } from '../src/cli/backup';
import { restoreBackup } from '../src/cli/restore';
import { FIXTURES } from './fixtures';
import { call, cid, startTestServer, type TestServer } from './harness';

const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

let s: TestServer;
beforeEach(async () => {
  s = await startTestServer();
});
afterEach(async () => {
  await s.close().catch(() => undefined);
});

describe('backup and restore', () => {
  it('backup → wipe → restore reproduces rooms, messages and images (checksums)', async () => {
    const ana = s.user('Ana');
    const sock = await s.connect(ana);
    const { room } = await call(sock, 'rooms:create', { name: 'Fotos' });
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(FIXTURES.png)]), 'a.png');
    const up = (await (
      await s.http('/api/uploads', { method: 'POST', body: form, user: ana })
    ).json()) as { attachment: { id: string } };
    await call(sock, 'messages:send', {
      roomId: room.id,
      clientId: cid(),
      body: 'olha',
      attachmentIds: [up.attachment.id],
    });
    await call(sock, 'messages:send', { roomId: MAIN_ROOM_ID, clientId: cid(), body: 'olá' });
    const original = sha(join(s.ctx.uploadsDir, up.attachment.id));

    const backup = await runBackup(s.config);
    expect(existsSync(join(backup, 'db.sqlite'))).toBe(true);
    expect(sha(join(backup, 'uploads', up.attachment.id))).toBe(original);

    await s.close();
    rmSync(join(s.config.dataDir, 'db.sqlite'), { force: true });
    rmSync(join(s.config.dataDir, 'uploads'), { recursive: true, force: true });

    const aside = restoreBackup(s.config, backup);
    expect(existsSync(aside)).toBe(true);

    const app = await buildApp(s.config);
    try {
      const rooms = app.pausa.db.prepare('SELECT name FROM rooms ORDER BY is_main DESC').all();
      expect(rooms).toEqual([{ name: 'geral' }, { name: 'Fotos' }]);
      const bodies = app.pausa.db.prepare('SELECT body FROM messages ORDER BY id').all();
      expect(bodies).toEqual([{ body: 'olha' }, { body: 'olá' }]);
      expect(sha(join(app.pausa.uploadsDir, up.attachment.id))).toBe(original);
    } finally {
      await app.close();
    }
  });

  it(`keeps only the newest ${KEEP} backups`, async () => {
    for (let i = 0; i < KEEP + 2; i++) await runBackup(s.config, new Date(2026, 0, 1, 10, 0, i));
    const kept = readdirSync(join(s.config.dataDir, 'backups')).sort();
    expect(kept).toHaveLength(KEEP);
    expect(kept[0]).toBe('2026-01-01-100002');
  });

  it('refuses a folder that is not a backup', () => {
    expect(() => restoreBackup(s.config, s.config.dataDir + '/nope')).toThrow(/not a backup/);
  });
});
