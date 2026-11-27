import type { CakeDebt, ClientEventPayload, DebtKind, DebtStatus } from '@pausa/shared';
import type { Db } from '../db';
import { AppError } from '../errors';
import { newId } from '../ids';
import type { UserRow } from '../members/service';
import { addGuest, personOfUser, requirePerson } from './people';

/**
 * Cake debts (D-53). Anyone records a milestone; it counts once someone else (or an admin) confirms,
 * or right away when you declare your own. Paid only when someone other than the debtor confirms.
 */

interface DebtRow {
  id: string;
  person_id: string;
  reason: string;
  kind: DebtKind;
  occurred_on: string;
  status: DebtStatus;
  recorded_by: string | null;
  confirmed_by: string | null;
  pledged_on: string | null;
  pledge_kind: 'volunteer' | 'nominated' | null;
  paid_on: string | null;
  paid_confirmed_by: string | null;
  created_at: number;
}

const toDebt = (r: DebtRow): CakeDebt => ({
  id: r.id,
  personId: r.person_id,
  reason: r.reason,
  kind: r.kind,
  occurredOn: r.occurred_on,
  status: r.status,
  recordedBy: r.recorded_by,
  confirmedBy: r.confirmed_by,
  pledgedOn: r.pledged_on,
  pledgeKind: r.pledge_kind,
  paidOn: r.paid_on,
  createdAt: r.created_at,
});

export function listDebts(db: Db): CakeDebt[] {
  return (
    db
      .prepare(
        `SELECT * FROM cake_debts WHERE status != 'cancelled' ORDER BY occurred_on, created_at`,
      )
      .all() as DebtRow[]
  ).map(toDebt);
}

export function getDebt(db: Db, id: string): CakeDebt {
  const row = db.prepare('SELECT * FROM cake_debts WHERE id = ?').get(id) as DebtRow | undefined;
  if (!row) throw new AppError('NOT_FOUND', 'Debt not found');
  return toDebt(row);
}

const isStaff = (u: UserRow) => u.role === 'host' || u.role === 'admin';

export function insertDebt(
  db: Db,
  d: {
    personId: string;
    reason: string;
    kind: DebtKind;
    occurredOn: string;
    status: DebtStatus;
    recordedBy: string | null;
    confirmedBy?: string | null;
    paidOn?: string | null;
  },
): CakeDebt {
  const id = newId();
  db.prepare(
    `INSERT INTO cake_debts (id, person_id, reason, kind, occurred_on, status, recorded_by, confirmed_by, paid_on, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    d.personId,
    d.reason,
    d.kind,
    d.occurredOn,
    d.status,
    d.recordedBy,
    d.confirmedBy ?? null,
    d.paidOn ?? null,
    Date.now(),
  );
  return getDebt(db, id);
}

export function recordMilestone(
  db: Db,
  actor: UserRow,
  input: ClientEventPayload<'cakes:record'>,
): CakeDebt {
  return db.transaction(() => {
    const person = input.personId
      ? requirePerson(db, input.personId)
      : addGuest(db, input.guestName!);
    const own = person.userId === actor.id;
    return insertDebt(db, {
      personId: person.id,
      reason: input.reason,
      kind: 'milestone',
      occurredOn: input.occurredOn,
      status: own ? 'owed' : 'pending',
      recordedBy: actor.id,
      confirmedBy: own ? actor.id : null,
    });
  })();
}

export function confirmDebt(db: Db, actor: UserRow, debtId: string): CakeDebt {
  const debt = getDebt(db, debtId);
  if (debt.status !== 'pending') throw new AppError('VALIDATION', 'Already confirmed');
  // A second person has to vouch for it (or an admin); the debtor admitting it counts too.
  const debtor = requirePerson(db, debt.personId);
  if (debt.recordedBy === actor.id && debtor.userId !== actor.id && !isStaff(actor))
    throw new AppError('FORBIDDEN', 'Someone else has to confirm');
  db.prepare(`UPDATE cake_debts SET status = 'owed', confirmed_by = ? WHERE id = ?`).run(
    actor.id,
    debtId,
  );
  return getDebt(db, debtId);
}

export function cancelDebt(db: Db, actor: UserRow, debtId: string): CakeDebt {
  const debt = getDebt(db, debtId);
  if (debt.status === 'paid' || debt.status === 'cancelled')
    throw new AppError('VALIDATION', 'Nothing to cancel');
  const ownPending = debt.status === 'pending' && debt.recordedBy === actor.id;
  if (!ownPending && !isStaff(actor)) throw new AppError('FORBIDDEN', 'Only an admin can cancel');
  db.prepare(`UPDATE cake_debts SET status = 'cancelled' WHERE id = ?`).run(debtId);
  return getDebt(db, debtId);
}

/** "Levo eu": the debtor promises it for a day. */
export function pledge(db: Db, actor: UserRow, debtId: string, date: string, todayIso: string) {
  const debt = getDebt(db, debtId);
  if (debt.status !== 'owed') throw new AppError('VALIDATION', 'Not an open debt');
  if (personOfUser(db, actor.id)?.id !== debt.personId && !isStaff(actor))
    throw new AppError('FORBIDDEN', 'Only whoever owes it can promise it');
  if (date < todayIso) throw new AppError('VALIDATION', 'That day has passed');
  db.prepare(`UPDATE cake_debts SET pledged_on = ?, pledge_kind = 'volunteer' WHERE id = ?`).run(
    date,
    debtId,
  );
  return getDebt(db, debtId);
}

export function unpledge(db: Db, actor: UserRow, debtId: string) {
  const debt = getDebt(db, debtId);
  if (personOfUser(db, actor.id)?.id !== debt.personId && !isStaff(actor))
    throw new AppError('FORBIDDEN', 'Not yours');
  db.prepare('UPDATE cake_debts SET pledged_on = NULL, pledge_kind = NULL WHERE id = ?').run(
    debtId,
  );
  return getDebt(db, debtId);
}

/** Someone other than the debtor says the cake arrived (or an admin). */
export function markPaid(db: Db, actor: UserRow, debtId: string, todayIso: string): CakeDebt {
  const debt = getDebt(db, debtId);
  if (debt.status !== 'owed') throw new AppError('VALIDATION', 'Not an open debt');
  if (personOfUser(db, actor.id)?.id === debt.personId && !isStaff(actor))
    throw new AppError('FORBIDDEN', 'Someone else has to confirm the cake arrived');
  db.prepare(
    `UPDATE cake_debts SET status = 'paid', paid_on = ?, paid_confirmed_by = ? WHERE id = ?`,
  ).run(todayIso, actor.id, debtId);
  return getDebt(db, debtId);
}
