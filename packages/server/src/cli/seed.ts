// Test utility: `node dist/seed.js --count 5000 [--room carga]` fills a room (default #geral) with
// numbered messages from a test user. Used by the E2E performance check. Never run against real data.
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { cleanDisplayName, MAIN_ROOM_ID, nameKey } from '@pausa/shared';
import { loadConfig } from '../config';
import { nextSeq, openDatabase } from '../db';
import { newId } from '../ids';

const { values } = parseArgs({
  options: { count: { type: 'string', default: '1000' }, room: { type: 'string' } },
});
const count = Math.min(Number(values.count) || 1000, 20_000);
const config = loadConfig();
const db = openDatabase(join(config.dataDir, 'db.sqlite'));
try {
  const name = cleanDisplayName('Teste Automático');
  let user = db.prepare('SELECT id FROM users WHERE name_key = ?').get(nameKey(name)) as
    { id: string } | undefined;
  if (!user) {
    user = { id: newId() };
    db.prepare(
      `INSERT INTO users (id, display_name, name_key, role, created_at) VALUES (?, ?, ?, 'member', ?)`,
    ).run(user.id, name, nameKey(name), Date.now());
  }
  let roomId = MAIN_ROOM_ID;
  if (values.room) {
    const slug = values.room;
    const room = db.prepare('SELECT id FROM rooms WHERE slug = ?').get(slug) as
      { id: string } | undefined;
    roomId = room?.id ?? newId();
    if (!room) {
      db.prepare(
        'INSERT INTO rooms (id, slug, name, is_main, created_by, created_at) VALUES (?, ?, ?, 0, ?, ?)',
      ).run(roomId, slug, slug, user.id, Date.now());
    }
  }
  const insert = db.prepare(
    'INSERT INTO messages (id, room_id, user_id, client_id, body, seq, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const start = Date.now() - count * 60_000;
  db.transaction(() => {
    for (let i = 0; i < count; i++) {
      insert.run(
        newId(),
        roomId,
        user.id,
        `seed-${Date.now()}-${i}`,
        `Mensagem de teste n.º ${i + 1}`,
        nextSeq(db),
        start + i * 60_000,
      );
    }
  })();
  console.log(`Seeded ${count} messages.`);
} finally {
  db.close();
}
