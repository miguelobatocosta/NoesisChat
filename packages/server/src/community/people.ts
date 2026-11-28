import { cleanDisplayName, nameKey, type Person } from '@pausa/shared';
import type { Db } from '../db';
import { AppError } from '../errors';
import { newId } from '../ids';

interface PersonRow {
  id: string;
  name: string;
  name_key: string;
  user_id: string | null;
  birthday_md: string | null;
  in_team: number;
  created_at: number;
  /** Joined: the member's current display name. */
  display_name: string | null;
}

const SELECT = `SELECT p.*, u.display_name FROM people p LEFT JOIN users u ON u.id = p.user_id`;

/** Every active, non-bot member gets a person (idempotent; cheap enough to run before each read). */
function syncPeople(db: Db): void {
  const missing = db
    .prepare(
      `SELECT u.id, u.display_name, u.name_key FROM users u
       WHERE u.is_bot = 0 AND u.revoked_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM people p WHERE p.user_id = u.id)`,
    )
    .all() as { id: string; display_name: string; name_key: string }[];
  const insert = db.prepare(
    'INSERT INTO people (id, name, name_key, user_id, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  // ULIDs, like every other id: clients send them back through the Id schema.
  for (const u of missing) insert.run(newId(), u.display_name, u.name_key, u.id, Date.now());
}

const toPerson = (r: PersonRow): Person => ({
  id: r.id,
  name: r.display_name ?? r.name,
  userId: r.user_id,
  birthday: r.birthday_md,
  inTeam: r.in_team === 1,
});

export function listPeople(db: Db): Person[] {
  syncPeople(db);
  const rows = db
    .prepare(
      `${SELECT} WHERE p.user_id IS NULL OR u.revoked_at IS NULL ORDER BY coalesce(u.display_name, p.name)`,
    )
    .all() as PersonRow[];
  return rows.map(toPerson);
}

export function getPerson(db: Db, id: string): Person | undefined {
  const row = db.prepare(`${SELECT} WHERE p.id = ?`).get(id) as PersonRow | undefined;
  return row ? toPerson(row) : undefined;
}

export function requirePerson(db: Db, id: string): Person {
  const p = getPerson(db, id);
  if (!p) throw new AppError('NOT_FOUND', 'Person not found');
  return p;
}

export function personOfUser(db: Db, userId: string): Person | undefined {
  syncPeople(db);
  const row = db.prepare(`${SELECT} WHERE p.user_id = ?`).get(userId) as PersonRow | undefined;
  return row ? toPerson(row) : undefined;
}

/**
 * A member or guest by name (accent/case-insensitive), as Excel names come in. Revoked members are
 * skipped: their history is hidden, so a match would make imported rows vanish.
 */
export function findPersonByName(db: Db, name: string): Person | undefined {
  syncPeople(db);
  const key = nameKey(cleanDisplayName(name));
  const row = db
    .prepare(
      `${SELECT} WHERE coalesce(u.name_key, p.name_key) = ? AND (p.user_id IS NULL OR u.revoked_at IS NULL)
       ORDER BY p.user_id IS NULL LIMIT 1`,
    )
    .get(key) as PersonRow | undefined;
  return row ? toPerson(row) : undefined;
}

export function addGuest(db: Db, rawName: string, inTeam = false): Person {
  const name = cleanDisplayName(rawName);
  const existing = findPersonByName(db, name);
  if (existing) return existing;
  const id = newId();
  db.prepare(
    'INSERT INTO people (id, name, name_key, user_id, in_team, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
  ).run(id, name, nameKey(name), inTeam ? 1 : 0, Date.now());
  return getPerson(db, id)!;
}

/** Moves a guest's history onto a member's person and removes the guest. */
export function mergeGuest(db: Db, guestId: string, userId: string): void {
  db.transaction(() => {
    const guest = requirePerson(db, guestId);
    if (guest.userId) throw new AppError('VALIDATION', 'Not a guest');
    const member = personOfUser(db, userId);
    if (!member) throw new AppError('NOT_FOUND', 'Member not found');
    db.prepare('UPDATE cake_debts SET person_id = ? WHERE person_id = ?').run(member.id, guest.id);
    // Office rows are keyed by person: keep the member's own row when both exist for a day/week.
    for (const table of ['office_votes', 'attendance']) {
      db.prepare(`UPDATE OR IGNORE ${table} SET person_id = ? WHERE person_id = ?`).run(
        member.id,
        guest.id,
      );
      db.prepare(`DELETE FROM ${table} WHERE person_id = ?`).run(guest.id);
    }
    if (!member.birthday && guest.birthday)
      db.prepare('UPDATE people SET birthday_md = ? WHERE id = ?').run(guest.birthday, member.id);
    db.prepare('DELETE FROM people WHERE id = ?').run(guest.id);
  })();
}

export function setBirthday(db: Db, personId: string, md: string | null): void {
  requirePerson(db, personId);
  db.prepare('UPDATE people SET birthday_md = ? WHERE id = ?').run(md, personId);
}

export function setTeam(db: Db, personId: string, inTeam: boolean): void {
  requirePerson(db, personId);
  db.prepare('UPDATE people SET in_team = ? WHERE id = ?').run(inTeam ? 1 : 0, personId);
}
