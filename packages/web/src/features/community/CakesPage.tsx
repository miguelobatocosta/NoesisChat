import { type FormEvent, useMemo, useState } from 'react';
import { Menu } from 'lucide-react';
import { type CakeDebt, type CommunityState, mascotByKey } from '@pausa/shared';
import { t } from '../../i18n';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import { Dialog } from '../../ui/Dialog';
import forms from '../../ui/forms.module.css';
import styles from './Community.module.css';
import { Confetti } from './Confetti';
import { MascotSays, useHostMascot } from './MascotSays';
import {
  birthdays,
  daysBetween,
  debtors,
  paid,
  pending,
  REASON_KEYS,
  showDate,
  showMonthDay,
  staleness,
  topBakers,
  weekdayOf,
} from './selectors';

const weekdayShort = (iso: string) =>
  `${t(`office.weekdays.${weekdayOf(iso) as 1 | 2 | 3 | 4 | 5}`)}, ${showDate(iso).slice(0, 5)}`;

/** Next Wednesday (the usual office day) as 'YYYY-MM-DD', for the "Levo eu" default. */
function nextWednesday(today: string): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + ((3 - date.getDay() + 7) % 7 || 7));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function useMe() {
  const me = useChat((s) => s.me);
  const community = useChat((s) => s.community);
  const person = community?.people.find((p) => p.userId === me.id);
  return { me, person, staff: me.role === 'host' || me.role === 'admin' };
}

const nameOf = (c: CommunityState, id: string) => c.people.find((p) => p.id === id)?.name ?? '?';
const nextOfficeDay = (c: CommunityState) => c.days.find((d) => d.date >= c.today && !d.closed);

/** 🎂 Bolos (D-53, Phase 19): the #geral mascot runs the board; the cake book, the next cake, honour. */
export function CakesPage({ onOpenRooms }: { onOpenRooms: () => void }) {
  const community = useChat((s) => s.community);
  const [recording, setRecording] = useState(false);
  const [burst, setBurst] = useState(0);
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
        <button
          type="button"
          className={`${buttons.accent} ${styles.headerAction}`}
          onClick={() => setRecording(true)}
        >
          {t('cakes.openRecord')}
        </button>
      </header>
      <div className={styles.scroll}>
        {!community ? (
          <p className={styles.muted}>{t('boot.loading')}</p>
        ) : (
          <>
            <Hero c={community} />
            <div className={styles.layout}>
              <Ledger c={community} onPaid={() => setBurst(Date.now())} />
              <aside className={styles.side}>
                <NextCake c={community} />
                <Pending c={community} />
                <Birthdays c={community} />
              </aside>
            </div>
            <div className={styles.layoutBottom}>
              <Honour c={community} />
              <History c={community} />
            </div>
          </>
        )}
      </div>
      {community && recording && <RecordDialog c={community} onClose={() => setRecording(false)} />}
      <Confetti burst={burst} />
    </section>
  );
}

function Hero({ c }: { c: CommunityState }) {
  const mascot = useHostMascot();
  const mascotName = useChat(
    (s) => s.members[mascotByKey(mascot).userId]?.displayName ?? mascotByKey(mascot).name,
  );
  const list = useMemo(() => debtors(c), [c]);
  const owed = c.debts.filter((d) => d.status === 'owed').length;
  const year = c.today.slice(0, 4);
  const paidYear = c.debts.filter(
    (d) => d.status === 'paid' && (d.paidOn ?? d.occurredOn).startsWith(year),
  ).length;
  const next = nextOfficeDay(c);
  const top = list[0];
  const line = top
    ? t(`bubble.${mascot}.topDebtor`, { name: top.person.name, days: top.oldestDays })
    : t(`bubble.${mascot}.allPaid`);

  return (
    <div className={styles.hero}>
      <MascotSays mascot={mascot} line={line} name={mascotName} />
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>{t('cakes.statOwed')}</dt>
          <dd className={`${styles.statNumber} num`}>{owed}</dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>{t('cakes.statPaidYear')}</dt>
          <dd className={`${styles.statNumber} num`}>{paidYear}</dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>{t('cakes.statNext')}</dt>
          <dd className={styles.statText}>
            {next ? weekdayShort(next.date) : t('cakes.statNextNone')}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Ledger({ c, onPaid }: { c: CommunityState; onPaid: () => void }) {
  const list = useMemo(() => debtors(c), [c]);
  const { person: mine, staff } = useMe();
  const store = getStore();
  const [pledging, setPledging] = useState<string | null>(null);
  const [date, setDate] = useState(() => nextOfficeDay(c)?.date ?? nextWednesday(c.today));

  return (
    <section className={`${styles.card} ${styles.ledger}`} aria-labelledby="cakes-owed">
      <h2 id="cakes-owed" className={styles.cardTitle}>
        {t('cakes.owedTitle')}
      </h2>
      <p className={styles.eyebrow}>{t('cakes.ledgerHint')}</p>
      {list.length === 0 && <p className={styles.muted}>{t('cakes.nobodyOwes')}</p>}
      <ol className={styles.rows}>
        {list.map(({ person, debts, oldestDays }, i) => {
          const stale = staleness(oldestDays);
          return (
            <li key={person.id} className={styles.ledgerRow}>
              <div className={styles.ledgerMain}>
                <span className={styles.ledgerName}>
                  {person.name}
                  {i === 0 && <span className={styles.badgeText}>{t('cakes.topDebtor')}</span>}
                </span>
                <div className={styles.staleTrack} aria-hidden="true">
                  <span
                    className={styles.staleFill}
                    data-level={stale.level}
                    style={{ width: `${Math.min(100, (oldestDays / 365) * 100)}%` }}
                  />
                </div>
                <span className={styles.staleLabel}>
                  {t(`stale.${stale.key}`)} ·{' '}
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
                      onPaid={() =>
                        void store.act('cakes:paid', { debtId: d.id }).then((ok) => ok && onPaid())
                      }
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
              <div className={styles.ledgerDays}>
                <span className={`${styles.daysNumber} num`}>{oldestDays}</span>
                <span className={styles.statLabel}>{t('cakes.days')}</span>
              </div>
            </li>
          );
        })}
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
        <span className={styles.debtReason}>{debt.reason}</span>{' '}
        <span className="num">· {showDate(debt.occurredOn)}</span>
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

/** The next office day as a ticket: when, how long until, who brings the cake. */
function NextCake({ c }: { c: CommunityState }) {
  const next = nextOfficeDay(c);
  const bringers = next
    ? c.debts.filter((d) => d.pledgedOn === next.date && d.status === 'owed')
    : [];
  const inDays = next ? daysBetween(c.today, next.date) : 0;
  return (
    <section className={`${styles.card} ${styles.ticket}`} aria-labelledby="cakes-next">
      <h2 id="cakes-next" className={styles.eyebrow}>
        {t('cakes.nextTitle')}
      </h2>
      {!next ? (
        <p className={styles.muted}>{t('cakes.nextNoDay')}</p>
      ) : (
        <>
          <p className={styles.ticketDay}>{weekdayShort(next.date)}</p>
          <p className={styles.ticketWhen}>
            {inDays === 0
              ? t('cakes.nextToday')
              : inDays === 1
                ? t('cakes.nextTomorrow')
                : t('cakes.nextIn', { days: inDays })}
          </p>
          <p className={styles.ticketStub}>
            {bringers.length
              ? t('cakes.nextBringers', {
                  names: bringers.map((d) => nameOf(c, d.personId)).join(', '),
                })
              : t('cakes.nextNobody')}
          </p>
        </>
      )}
    </section>
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

function Birthdays({ c }: { c: CommunityState }) {
  const list = birthdays(c).slice(0, 6);
  const { person: mine } = useMe();
  const store = getStore();
  const [value, setValue] = useState(mine?.birthday ? `2000-${mine.birthday}` : '');
  return (
    <section className={styles.card} aria-labelledby="cakes-birthdays">
      <h2 id="cakes-birthdays" className={styles.cardTitle}>
        {t('cakes.birthdaysTitle')}
      </h2>
      {list.length === 0 && <p className={styles.muted}>{t('cakes.noBirthdays')}</p>}
      <ul className={styles.calendar}>
        {list.map(({ person, inDays }) => (
          <li key={person.id} className={styles.calendarDay} data-today={inDays === 0 || undefined}>
            <span className={`${styles.calendarDate} num`}>{showMonthDay(person.birthday!)}</span>
            <span className={styles.calendarName}>{person.name}</span>
            <span className={styles.rowMeta}>
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

const MEDALS = ['🥇', '🥈', '🥉'] as const;

function Honour({ c }: { c: CommunityState }) {
  const bakers = topBakers(c);
  return (
    <section className={styles.card} aria-labelledby="cakes-honour">
      <h2 id="cakes-honour" className={styles.cardTitle}>
        {t('cakes.honourTitle')}
      </h2>
      {bakers.length === 0 ? (
        <p className={styles.muted}>{t('cakes.honourEmpty')}</p>
      ) : (
        <ol className={styles.podium}>
          {bakers.map((b, i) => (
            <li key={b.person.id} className={styles.podiumStep} data-place={i + 1}>
              <span className={styles.medal} aria-hidden="true">
                {MEDALS[i]}
              </span>
              <span className={styles.podiumName}>{b.person.name}</span>
              <span className={`${styles.podiumCount} num`}>{b.count}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function History({ c }: { c: CommunityState }) {
  const list = paid(c).slice(0, 12);
  return (
    <section className={styles.card} aria-labelledby="cakes-history">
      <h2 id="cakes-history" className={styles.cardTitle}>
        {t('cakes.historyTitle')}
      </h2>
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

const OTHER = '__other__';

function RecordDialog({ c, onClose }: { c: CommunityState; onClose: () => void }) {
  const store = getStore();
  const [who, setWho] = useState('');
  const [guest, setGuest] = useState('');
  const [reasonKey, setReasonKey] = useState<string>(REASON_KEYS[1]);
  const [custom, setCustom] = useState('');
  const [date, setDate] = useState(c.today);

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
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('cakes.recordTitle')}
      closeLabel={t('admin.cancel')}
      size="sm"
    >
      <p className={styles.muted}>{t('cakes.recordHint')}</p>
      <form className={styles.form} onSubmit={(e) => void submit(e)}>
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
            {c.people.map((p) => (
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
      </form>
    </Dialog>
  );
}
