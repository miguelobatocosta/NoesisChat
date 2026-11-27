import type { ImportRow, ImportSheet } from '@pausa/shared';
import type { Db } from '../db';
import { insertDebt } from './cakes';
import { parseSheetDate } from './dates';
import { addGuest, findPersonByName } from './people';

/**
 * Pasted Excel sheets (D-53), tab-separated as Excel copies them:
 *   cakes:     Data | Réu | Motivo | Estado          ("Bolos Outros")
 *   birthdays: Data | Aniversariante | Estado        ("Aniversários")
 * Estado "Ok" = paid, anything else ("Em Falta") = owed. A header row is skipped.
 */
export function parseSheet(db: Db, sheet: ImportSheet, text: string): ImportRow[] {
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
