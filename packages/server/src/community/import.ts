import type { ImportRow, ImportSheet } from '@pausa/shared';
import type { Db } from '../db';
import { insertDebt } from './cakes';
import { addDays, parseIso, parseSheetDate, weekStart } from './dates';
import { addGuest, findPersonByName } from './people';

/**
 * Pasted Excel sheets (D-53), tab-separated as Excel copies them:
 *   cakes:     Data | Réu | Motivo | Estado          ("Bolos Outros")
 *   birthdays: Data | Aniversariante | Estado        ("Aniversários")
 * Estado "Ok" = paid, anything else ("Em Falta") = owed. A header row is skipped.
 */
export function parseSheet(db: Db, sheet: ImportSheet, text: string): ImportRow[] {
  if (sheet === 'attendance') return parseAttendance(db, text).map((r) => r.row);
  const rows: ImportRow[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const cells = line.split('\t').map((c) => c.trim());
    if (cells.every((c) => !c)) return;
    if (i === 0 && /^data$/i.test(cells[0] ?? '')) return; // header
    const [rawDate = '', name = '', third = '', fourth = ''] = cells;
    const reason = sheet === 'cakes' ? third : 'Aniversário';
    const state = (sheet === 'cakes' ? fourth : third).toLowerCase();
    const date = parseSheetDate(rawDate);
    const error = !name
      ? 'sem nome'
      : !date
        ? 'data inválida'
        : sheet === 'cakes' && reason.length < 2
          ? 'sem motivo'
          : null;
    rows.push({
      line: i + 1,
      name,
      date,
      reason: reason.slice(0, 80),
      status: state === 'ok' ? 'paid' : 'owed',
      personId: name ? (findPersonByName(db, name)?.id ?? null) : null,
      error,
    });
  });
  return rows;
}

export function commitSheet(
  db: Db,
  sheet: ImportSheet,
  text: string,
): { created: number; skipped: number; guests: number } {
  if (sheet === 'attendance') return commitAttendance(db, text);
  return db.transaction(() => {
    let created = 0;
    let skipped = 0;
    let guests = 0;
    for (const row of parseSheet(db, sheet, text)) {
      if (row.error || !row.date) {
        skipped++;
        continue;
      }
      let personId = row.personId;
      if (!personId) {
        personId = addGuest(db, row.name).id;
        guests++;
      }
      if (sheet === 'birthdays')
        db.prepare('UPDATE people SET birthday_md = ? WHERE id = ?').run(
          row.date.slice(5),
          personId,
        );
      // Importing the same sheet twice doesn't duplicate debts.
      const dup = db
        .prepare(
          `SELECT 1 FROM cake_debts WHERE person_id = ? AND occurred_on = ? AND lower(reason) = lower(?) AND status != 'cancelled'`,
        )
        .get(personId, row.date, row.reason);
      if (dup) {
        skipped++;
        continue;
      }
      insertDebt(db, {
        personId,
        reason: row.reason,
        kind: sheet === 'birthdays' ? 'birthday' : 'import',
        occurredOn: row.date,
        status: row.status,
        recordedBy: null,
        paidOn: row.status === 'paid' ? row.date : null,
      });
      created++;
    }
    return { created, skipped, guests };
  })();
}

// --- "Presenças" (D-54): Data | Nome | Presença | Desculpa | Bolo | Aviso Prévio | Justificação ---

interface AttendanceImport {
  row: ImportRow;
  present: boolean;
  excuse: string | null;
  notice: boolean;
  judgement: 'justified' | 'unjustified' | null;
}

const marked = (v: string | undefined) => !!v && /^x$/i.test(v.trim());

function parseAttendance(db: Db, text: string): AttendanceImport[] {
  const out: AttendanceImport[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const cells = line.split('\t').map((c) => c.trim());
    if (cells.every((c) => !c)) return;
    if (i === 0 && /^data$/i.test(cells[0] ?? '')) return;
    const [rawDate = '', name = '', presence, rawExcuse = '', , notice, justification = ''] = cells;
    const date = parseSheetDate(rawDate);
    const present = marked(presence);
    const excuse = rawExcuse || null;
    // A row with nothing filled in says nothing: skipped rather than counted as an absence.
    const empty = !present && !excuse && !justification;
    const judgement = present
      ? null
      : /^justificad/i.test(justification) || marked(notice)
        ? 'justified'
        : 'unjustified';
    const error = !name ? 'sem nome' : !date ? 'data inválida' : empty ? 'linha vazia' : null;
    out.push({
      row: {
        line: i + 1,
        name,
        date,
        reason: present
          ? 'presente'
          : `${judgement === 'justified' ? 'falta justificada' : 'falta'}${excuse ? `: ${excuse}` : ''}`,
        status: present || judgement === 'justified' ? 'paid' : 'owed',
        personId: name ? (findPersonByName(db, name)?.id ?? null) : null,
        error,
      },
      present,
      excuse,
      notice: marked(notice),
      judgement,
    });
  });
  return out;
}

function commitAttendance(db: Db, text: string) {
  return db.transaction(() => {
    let created = 0;
    let skipped = 0;
    let guests = 0;
    const now = Date.now();
    for (const r of parseAttendance(db, text)) {
      const date = r.row.date;
      if (r.row.error || !date) {
        skipped++;
        continue;
      }
      let personId = r.row.personId;
      if (!personId) {
        personId = addGuest(db, r.row.name, true).id;
        guests++;
      }
      // Past days arrive closed; their absences are history and never count towards a no-show cake.
      db.prepare(
        `INSERT OR IGNORE INTO office_days (date, week_start, source, closed_at) VALUES (?, ?, 'import', ?)`,
      ).run(date, weekStart(date), now);
      const res = db
        .prepare(
          `INSERT OR IGNORE INTO attendance (date, person_id, plan, planned_at, status, excuse, judgement, noshow_debt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'import')`,
        )
        .run(
          date,
          personId,
          r.notice ? 'not_going' : null,
          r.notice ? parseIso(addDays(date, -1)).getTime() : null,
          r.present ? 'present' : 'absent',
          r.excuse,
          r.judgement,
        );
      if (res.changes) created++;
      else skipped++;
    }
    return { created, skipped, guests };
  })();
}
