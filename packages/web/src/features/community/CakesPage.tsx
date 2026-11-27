import { type FormEvent, useMemo, useState } from 'react';
import { Menu } from 'lucide-react';
import type { CakeDebt, CommunityState, Person } from '@pausa/shared';
import { t } from '../../i18n';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import forms from '../../ui/forms.module.css';
import styles from './Community.module.css';
import {
  birthdays,
  debtors,
  paid,
  pending,
  REASON_KEYS,
  showDate,
  showMonthDay,
  topBakers,
} from './selectors';

/** Next Wednesday (the usual office day) as 'YYYY-MM-DD', for the "Levo eu" default. */
function nextWednesday(today: string): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + ((3 - date.getDay() + 7) % 7 || 7));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** 🎂 Bolos (D-53): who owes, milestones waiting for a second person, birthdays, history. */
export function CakesPage({ onOpenRooms }: { onOpenRooms: () => void }) {
  const community = useChat((s) => s.community);
  return (
    <section className={styles.page} aria-labelledby="cakes-title">
      <header className={styles.header}>
        <button
          type="button"
          className={`${buttons.icon} ${styles.roomsButton}`}
          aria-label={t('room.openRooms')}
          onClick={onOpenRooms}
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden />
        </button>
        <h1 id="cakes-title" className={styles.title}>
          {t('cakes.title')}
        </h1>
      </header>
      <div className={styles.scroll}>
        {!community ? (
          <p className={styles.muted}>{t('boot.loading')}</p>
        ) : (
          <div className={styles.grid}>
            <Debtors c={community} />
            <Pending c={community} />
            <RecordForm c={community} />
            <Birthdays c={community} />
            <History c={community} />
          </div>
        )}
      </div>
    </section>
  );
}

function useMe() {
  const me = useChat((s) => s.me);
  const community = useChat((s) => s.community);
  const person = community?.people.find((p) => p.userId === me.id);
  return { me, person, staff: me.role === 'host' || me.role === 'admin' };
}

const nameOf = (c: CommunityState, id: string) => c.people.find((p) => p.id === id)?.name ?? '?';

function Debtors({ c }: { c: CommunityState }) {
  const list = useMemo(() => debtors(c), [c]);
  const { person: mine, staff } = useMe();
  const store = getStore();
  const [pledging, setPledging] = useState<string | null>(null);
  const [date, setDate] = useState(() => nextWednesday(c.today));

  return (
    <section className={`${styles.card} ${styles.wide}`} aria-labelledby="cakes-owed">
      <h2 id="cakes-owed" className={styles.cardTitle}>
        {t('cakes.owedTitle')}
      </h2>
      {list.length === 0 && <p className={styles.muted}>{t('cakes.nobodyOwes')}</p>}
      <ol className={styles.rows}>
        {list.map(({ person, debts, oldestDays }, i) => (
          <li key={person.id} className={styles.row}>
            <div className={styles.rowMain}>
              <span className={styles.rowTitle}>
                {person.name}
                {i === 0 && <span className={styles.badgeText}>{t('cakes.topDebtor')}</span>}
              </span>
              <span className={`${styles.rowMeta} num`}>
                {t('cakes.owedMeta', { count: debts.length, days: oldestDays })}
              </span>
              <ul className={styles.debtList}>
                {debts.map((d) => (
                  <DebtLine
                    key={d.id}
                    debt={d}
                    mine={mine?.id === person.id}
                    staff={staff}
                    onPledge={() => setPledging(d.id)}
                    onPaid={() => void store.act('cakes:paid', { debtId: d.id })}
                    onUnpledge={() => void store.act('cakes:unpledge', { debtId: d.id })}
                    onCancel={() => void store.act('cakes:cancel', { debtId: d.id })}
                  />
                ))}
              </ul>
              {debts.some((d) => d.id === pledging) && (
                <form
                  className={styles.inline}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void store
                      .act('cakes:pledge', { debtId: pledging!, date })
                      .then((ok) => ok && setPledging(null));
                  }}
                >
                  <label className={forms.field}>
                    <span className={forms.label}>{t('cakes.pledgeDay')}</span>
                    <input
                      className={forms.input}
                      type="date"
                      min={c.today}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                    />
                  </label>
                  <button type="submit" className={buttons.primary}>
                    {t('cakes.pledgeConfirm')}
                  </button>
                  <button
                    type="button"
                    className={buttons.secondary}
                    onClick={() => setPledging(null)}
                  >
                    {t('admin.cancel')}
                  </button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DebtLine(props: {
  debt: CakeDebt;
  mine: boolean;
  staff: boolean;
  onPledge: () => void;
  onUnpledge: () => void;
  onPaid: () => void;
  onCancel: () => void;
}) {
  const { debt, mine, staff } = props;
  return (
    <li className={styles.debt}>
      <span>
        {debt.reason} <span className="num">· {showDate(debt.occurredOn)}</span>
        {debt.pledgedOn && (
          <span className={styles.pledge}>
            {' '}
            {t(debt.pledgeKind === 'nominated' ? 'cakes.nominated' : 'cakes.pledged', {
              date: showDate(debt.pledgedOn),
            })}
          </span>
        )}
      </span>
      <span className={styles.actions}>
        {mine && !debt.pledgedOn && (
          <button type="button" className={buttons.secondary} onClick={props.onPledge}>
            {t('cakes.pledge')}
          </button>
        )}
        {mine && debt.pledgedOn && (
          <button type="button" className={buttons.ghost} onClick={props.onUnpledge}>
            {t('cakes.unpledge')}
          </button>
        )}
        {(!mine || staff) && (
          <button type="button" className={buttons.secondary} onClick={props.onPaid}>
            {t('cakes.paid')}
          </button>
        )}
        {staff && (
          <button type="button" className={buttons.ghost} onClick={props.onCancel}>
            {t('cakes.cancel')}
          </button>
        )}
      </span>
    </li>
  );
}

function Pending({ c }: { c: CommunityState }) {
  const list = pending(c);
  const { me, person: mine, staff } = useMe();
  const store = getStore();
  if (list.length === 0) return null;
  return (
    <section className={styles.card} aria-labelledby="cakes-pending">
      <h2 id="cakes-pending" className={styles.cardTitle}>
        {t('cakes.pendingTitle')}
      </h2>
      <ul className={styles.rows}>
        {list.map((d) => {
          const canConfirm = d.recordedBy !== me.id || mine?.id === d.personId || staff;
          const canCancel = d.recordedBy === me.id || staff;
          return (
            <li key={d.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>{nameOf(c, d.personId)}</span>
                <span className={styles.rowMeta}>
                  {d.reason} · {showDate(d.occurredOn)}
                  {d.recordedBy &&
                    ` · ${t('cakes.recordedBy', { name: store.nameOf(d.recordedBy) })}`}
                </span>
              </div>
              {canConfirm && (
                <button
                  type="button"
                  className={buttons.primary}
                  onClick={() => void store.act('cakes:confirm', { debtId: d.id })}
                >
                  {t('cakes.confirm')}
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  className={buttons.ghost}
                  onClick={() => void store.act('cakes:cancel', { debtId: d.id })}
                >
                  {t('cakes.cancel')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const OTHER = '__other__';

function RecordForm({ c }: { c: CommunityState }) {
  const store = getStore();
  const [who, setWho] = useState('');
  const [guest, setGuest] = useState('');
  const [reasonKey, setReasonKey] = useState<string>(REASON_KEYS[1]);
  const [custom, setCustom] = useState('');
  const [date, setDate] = useState(c.today);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const reason =
      reasonKey === OTHER
        ? custom.trim()
        : t(`cakes.reasons.${reasonKey as (typeof REASON_KEYS)[number]}`);
    const ok = await store.act('cakes:record', {
      ...(who === OTHER ? { guestName: guest.trim() } : { personId: who }),
      reason,
      occurredOn: date,
    });
    if (ok) {
      setDone(true);
      setCustom('');
      setGuest('');
    }
  }

  return (
    <section className={styles.card} aria-labelledby="cakes-record">
      <h2 id="cakes-record" className={styles.cardTitle}>
        {t('cakes.recordTitle')}
      </h2>
      <p className={styles.muted}>{t('cakes.recordHint')}</p>
      <form
        className={styles.form}
        onSubmit={(e) => void submit(e)}
        onChange={() => setDone(false)}
      >
        <label className={forms.field}>
          <span className={forms.label}>{t('cakes.who')}</span>
          <select
            className={forms.select}
            value={who}
            onChange={(e) => setWho(e.target.value)}
            required
          >
            <option value="" disabled>
              {t('cakes.pickPerson')}
            </option>
            {c.people.map((p: Person) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value={OTHER}>{t('cakes.someoneElse')}</option>
          </select>
        </label>
        {who === OTHER && (
          <label className={forms.field}>
            <span className={forms.label}>{t('cakes.guestName')}</span>
            <input
              className={forms.input}
              value={guest}
              onChange={(e) => setGuest(e.target.value)}
              minLength={2}
              maxLength={32}
              required
            />
          </label>
        )}
        <label className={forms.field}>
          <span className={forms.label}>{t('cakes.reason')}</span>
          <select
            className={forms.select}
            value={reasonKey}
            onChange={(e) => setReasonKey(e.target.value)}
          >
            {REASON_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`cakes.reasons.${k}`)}
              </option>
            ))}
            <option value={OTHER}>{t('cakes.otherReason')}</option>
          </select>
        </label>
        {reasonKey === OTHER && (
          <label className={forms.field}>
            <span className={forms.label}>{t('cakes.customReason')}</span>
            <input
              className={forms.input}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              minLength={2}
              maxLength={80}
              required
            />
          </label>
        )}
        <label className={forms.field}>
          <span className={forms.label}>{t('cakes.when')}</span>
          <input
            className={forms.input}
            type="date"
            value={date}
            max={c.today}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <button type="submit" className={buttons.accent}>
          {t('cakes.record')}
        </button>
        {done && (
          <p className={styles.muted} role="status">
            {t('cakes.recorded')}
          </p>
        )}
      </form>
    </section>
  );
}

function Birthdays({ c }: { c: CommunityState }) {
  const list = birthdays(c).slice(0, 8);
  const { person: mine } = useMe();
  const store = getStore();
  const [value, setValue] = useState(mine?.birthday ? `2000-${mine.birthday}` : '');
  return (
    <section className={styles.card} aria-labelledby="cakes-birthdays">
      <h2 id="cakes-birthdays" className={styles.cardTitle}>
        {t('cakes.birthdaysTitle')}
      </h2>
      <ul className={styles.rows}>
        {list.length === 0 && <li className={styles.muted}>{t('cakes.noBirthdays')}</li>}
        {list.map(({ person, inDays }) => (
          <li key={person.id} className={styles.row}>
            <span className={styles.rowTitle}>{person.name}</span>
            <span className={`${styles.rowMeta} num`}>
              {showMonthDay(person.birthday!)} ·{' '}
              {inDays === 0 ? t('cakes.today') : t('cakes.inDays', { days: inDays })}
            </span>
          </li>
        ))}
      </ul>
      {mine && (
        <form
          className={styles.inline}
          onSubmit={(e) => {
            e.preventDefault();
            void store.act('people:setBirthday', {
              personId: mine.id,
              birthday: value ? value.slice(5) : null,
            });
          }}
        >
          <label className={forms.field}>
            <span className={forms.label}>{t('cakes.myBirthday')}</span>
            <input
              className={forms.input}
              type="date"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <button type="submit" className={buttons.secondary}>
            {t('cakes.save')}
          </button>
        </form>
      )}
    </section>
  );
}

function History({ c }: { c: CommunityState }) {
  const list = paid(c).slice(0, 15);
  const bakers = topBakers(c);
  return (
    <section className={styles.card} aria-labelledby="cakes-history">
      <h2 id="cakes-history" className={styles.cardTitle}>
        {t('cakes.historyTitle')}
      </h2>
      {bakers.length > 0 && (
        <p className={styles.muted}>
          {t('cakes.topBakers', {
            names: bakers.map((b) => `${b.person.name} (${b.count})`).join(', '),
          })}
        </p>
      )}
      <ul className={styles.rows}>
        {list.length === 0 && <li className={styles.muted}>{t('cakes.noHistory')}</li>}
        {list.map((d) => (
          <li key={d.id} className={styles.row}>
            <span className={styles.rowTitle}>{nameOf(c, d.personId)}</span>
            <span className={`${styles.rowMeta} num`}>
              {d.reason} · {showDate(d.paidOn ?? d.occurredOn)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
