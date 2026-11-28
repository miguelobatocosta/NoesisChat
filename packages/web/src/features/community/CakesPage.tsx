import { type FormEvent, useMemo, useState } from 'react';
import type { CakeDebt, CommunityState } from '@pausa/shared';
import { t } from '../../i18n';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import { Dialog } from '../../ui/Dialog';
import forms from '../../ui/forms.module.css';
import styles from './Community.module.css';
import { CommunityPage } from './CommunityPage';
import { Confetti } from './Confetti';
import { useHostMascotName, useMe, useNameOf } from './hooks';
import { MascotSays } from './MascotSays';
import { Senha } from './Paper';
import {
  birthdays,
  daysBetween,
  debtors,
  nextOfficeDay,
  paid,
  paidByYear,
  pending,
  REASON_KEYS,
  showDate,
  showMonthDay,
  staleness,
  topBakers,
  weekdayName,
} from './selectors';

const weekdayShort = (iso: string) => `${weekdayName(iso)}, ${showDate(iso).slice(0, 5)}`;

function countdown(today: string, date: string): string {
  const days = daysBetween(today, date);
  if (days === 0) return t('cakes.nextToday');
  if (days === 1) return t('cakes.nextTomorrow');
  return t('cakes.nextIn', { days });
}

/** Next Wednesday (the usual office day) as 'YYYY-MM-DD', for the "Levo eu" default. */
function nextWednesday(today: string): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + ((3 - date.getDay() + 7) % 7 || 7));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

const byDate = (a: CakeDebt, b: CakeDebt) => a.occurredOn.localeCompare(b.occurredOn);

/**
 * 🎂 Bolos (D-53, Phase 20). One hero answers "who brings the next cake?" (the senha), then your
 * own situation, then the cake book; birthdays, honour and history are quiet reference below.
 */
export function CakesPage({ onOpenRooms }: { onOpenRooms: () => void }) {
  const community = useChat((s) => s.community);
  const [recording, setRecording] = useState(false);
  const [burst, setBurst] = useState(0);
  const celebrate = () => setBurst(Date.now());
  return (
    <CommunityPage
      id="cakes-title"
      title={t('cakes.title')}
      onOpenRooms={onOpenRooms}
      action={
        <button
          type="button"
          className={`${buttons.accent} ${styles.headerAction}`}
          onClick={() => setRecording(true)}
        >
          {t('cakes.openRecord')}
        </button>
      }
    >
      {community && (
        <>
          <Hero c={community} />
          <MyStatus c={community} />
          <Pending c={community} />
          <Ledger c={community} onPaid={celebrate} />
          <div className={styles.reference}>
            <Birthdays c={community} />
            <Honour c={community} />
            <History c={community} />
          </div>
          {recording && <RecordDialog c={community} onClose={() => setRecording(false)} />}
        </>
      )}
      <Confetti burst={burst} />
    </CommunityPage>
  );
}

/** The senha: the year's next cake number, the day, who brings it; the mascot comments beside it. */
function Hero({ c }: { c: CommunityState }) {
  const { mascot, name } = useHostMascotName();
  const nameOf = useNameOf();
  const { person: mine } = useMe();
  const store = getStore();
  const list = useMemo(() => debtors(c), [c]);
  const next = nextOfficeDay(c);
  const year = c.today.slice(0, 4);
  const paidYear = c.debts.filter(
    (d) => d.status === 'paid' && (d.paidOn ?? d.occurredOn).startsWith(year),
  ).length;
  const bringers = next
    ? c.debts.filter((d) => d.pledgedOn === next.date && d.status === 'owed')
    : [];
  const top = list[0];
  const line = top
    ? t(`bubble.${mascot}.topDebtor`, { name: top.person.name, days: top.oldestDays })
    : t(`bubble.${mascot}.allPaid`);
  const myOpen = mine
    ? c.debts
        .filter((d) => d.personId === mine.id && d.status === 'owed' && !d.pledgedOn)
        .sort(byDate)[0]
    : undefined;
  const bringerNames = [...new Set(bringers.map((d) => nameOf(d.personId)))].join(', ');

  return (
    <section className={styles.hero} aria-labelledby="cakes-next">
      <Senha number={paidYear + 1} year={year}>
        <span className={styles.senhaLabel}>{t('cakes.ticketBringer')}</span>
        <span className={styles.senhaWho}>{bringerNames || t('cakes.ticketNobody')}</span>
      </Senha>
      <div className={styles.heroMain}>
        <h2 id="cakes-next" className={styles.heroEyebrow}>
          {t('cakes.nextTitle')}
        </h2>
        <p className={styles.heroDay}>
          {next ? weekdayShort(next.date) : t('cakes.ticketUndecided')}
        </p>
        {next && <p className={`${styles.heroWhen} num`}>{countdown(c.today, next.date)}</p>}
        {!next && <p className={styles.heroNote}>{t('cakes.nextNoDay')}</p>}
        {next && bringers.length === 0 && (
          <p className={styles.heroNote}>{t('cakes.nextNobody')}</p>
        )}
        {next && myOpen && (
          <div className={styles.heroActions}>
            <button
              type="button"
              className={buttons.accent}
              onClick={() => void store.act('cakes:pledge', { debtId: myOpen.id, date: next.date })}
            >
              {t('cakes.pledgeNext')}
            </button>
          </div>
        )}
      </div>
      <MascotSays mascot={mascot} line={line} name={name} />
    </section>
  );
}

/** Your own line: what you owe (and whether you promised a day), or that you're clean. */
function MyStatus({ c }: { c: CommunityState }) {
  const { person: mine } = useMe();
  if (!mine) return null;
  const owed = c.debts.filter((d) => d.personId === mine.id && d.status === 'owed').sort(byDate);
  const oldest = owed[0];
  const promised = owed.find((d) => d.pledgedOn);
  const lastBrought = paid(c).find((d) => d.personId === mine.id);
  return (
    <section
      className={styles.status}
      data-tone={oldest ? 'owe' : 'clean'}
      aria-labelledby="cakes-me"
    >
      <h2 id="cakes-me" className={styles.eyebrow}>
        {t('cakes.myTitle')}
      </h2>
      <p className={styles.statusLine}>
        {oldest
          ? owed.length === 1
            ? t('cakes.myOwesOne')
            : t('cakes.myOwesMany', { count: owed.length })
          : t('cakes.myClean')}
      </p>
      <p className={styles.statusDetail}>
        {oldest
          ? `${t('cakes.myOldest', {
              reason: oldest.reason,
              days: daysBetween(oldest.occurredOn, c.today),
            })}${promised ? ` ${t('cakes.myPledged', { date: showDate(promised.pledgedOn!) })}` : ''}`
          : lastBrought
            ? t('cakes.myLastBrought', {
                date: showDate(lastBrought.paidOn ?? lastBrought.occurredOn),
              })
            : t('cakes.myNeverBrought')}
      </p>
    </section>
  );
}

function Ledger({ c, onPaid }: { c: CommunityState; onPaid: () => void }) {
  const list = useMemo(() => debtors(c), [c]);
  const { person: mine, staff } = useMe();
  const store = getStore();
  const [pledging, setPledging] = useState<string | null>(null);
  const [date, setDate] = useState(() => nextOfficeDay(c)?.date ?? nextWednesday(c.today));

  return (
    <section className={styles.section} aria-labelledby="cakes-owed">
      <div className={styles.sectionHead}>
        <h2 id="cakes-owed" className={styles.sectionTitle}>
          {t('cakes.owedTitle')}
        </h2>
        <p className={styles.eyebrow}>{t('cakes.ledgerHint')}</p>
      </div>
      {list.length === 0 && <p className={styles.muted}>{t('cakes.nobodyOwes')}</p>}
      <ol className={styles.rows}>
        {list.map(({ person, debts, oldestDays }, i) => {
          const stale = staleness(oldestDays);
          return (
            <li key={person.id} className={styles.ledgerRow} data-rank={i + 1}>
              <span className={`${styles.rank} num`} aria-hidden="true">
                {t('cakes.rank', { rank: i + 1 })}
              </span>
              <div className={styles.ledgerMain}>
                <span className={styles.ledgerName}>
                  {person.name}
                  {i === 0 && <span className={styles.badgeText}>{t('cakes.topDebtor')}</span>}
                </span>
                <div className={styles.staleTrack} aria-hidden="true">
                  <span
                    className={styles.staleFill}
                    data-level={stale.level}
                    style={{ width: `${Math.max(4, Math.min(100, (oldestDays / 365) * 100))}%` }}
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
                <span className={styles.eyebrow}>{t('cakes.days')}</span>
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

/** Milestones waiting for a second person: an action, so it sits right under your status. */
function Pending({ c }: { c: CommunityState }) {
  const list = pending(c);
  const { me, person: mine, staff } = useMe();
  const nameOf = useNameOf();
  const store = getStore();
  if (list.length === 0) return null;
  return (
    <section className={styles.attention} aria-labelledby="cakes-pending">
      <h2 id="cakes-pending" className={styles.sectionTitle}>
        {t('cakes.pendingTitle')}
      </h2>
      <ul className={styles.rows}>
        {list.map((d) => {
          const canConfirm = d.recordedBy !== me.id || mine?.id === d.personId || staff;
          const canCancel = d.recordedBy === me.id || staff;
          return (
            <li key={d.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>{nameOf(d.personId)}</span>
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
  const [editing, setEditing] = useState(false);
  return (
    <section className={styles.refBlock} aria-labelledby="cakes-birthdays">
      <h2 id="cakes-birthdays" className={styles.sectionTitle}>
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
        <button type="button" className={styles.linkButton} onClick={() => setEditing(true)}>
          {mine.birthday
            ? t('cakes.changeBirthday', { date: showMonthDay(mine.birthday) })
            : t('cakes.setBirthday')}
        </button>
      )}
      {mine && editing && (
        <BirthdayDialog
          personId={mine.id}
          current={mine.birthday}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  );
}

function BirthdayDialog({
  personId,
  current,
  onClose,
}: {
  personId: string;
  current: string | null;
  onClose: () => void;
}) {
  const store = getStore();
  const [value, setValue] = useState(current ? `2000-${current}` : '');
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('cakes.myBirthday')}
      closeLabel={t('admin.cancel')}
      size="sm"
    >
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void store
            .act('people:setBirthday', { personId, birthday: value ? value.slice(5) : null })
            .then((ok) => ok && onClose());
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
        <button type="submit" className={buttons.primary}>
          {t('cakes.save')}
        </button>
      </form>
    </Dialog>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'] as const;

function Honour({ c }: { c: CommunityState }) {
  const bakers = topBakers(c);
  return (
    <section className={styles.refBlock} aria-labelledby="cakes-honour">
      <h2 id="cakes-honour" className={styles.sectionTitle}>
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

const HISTORY_PREVIEW = 6;

function History({ c }: { c: CommunityState }) {
  const nameOf = useNameOf();
  const [all, setAll] = useState(false);
  const years = paidByYear(c);
  const total = years.reduce((n, y) => n + y.debts.length, 0);
  // Rows before each year, so the preview can stop after HISTORY_PREVIEW across year groups.
  const before = years.map((_, i) => years.slice(0, i).reduce((n, y) => n + y.debts.length, 0));
  const limit = all ? Infinity : HISTORY_PREVIEW;
  const shown = years
    .map(({ year, debts }, i) => ({ year, debts: debts.slice(0, Math.max(0, limit - before[i]!)) }))
    .filter((y) => y.debts.length > 0);

  return (
    <section className={styles.refBlock} aria-labelledby="cakes-history">
      <h2 id="cakes-history" className={styles.sectionTitle}>
        {t('cakes.historyTitle')}
      </h2>
      {total === 0 && <p className={styles.muted}>{t('cakes.noHistory')}</p>}
      {shown.map(({ year, debts }) => (
        <div key={year} className={styles.yearGroup}>
          <h3 className={`${styles.yearLabel} num`}>{year}</h3>
          <ul className={styles.rows}>
            {debts.map((d) => (
              <li key={d.id} className={styles.historyRow}>
                <span className={styles.rowTitle}>{nameOf(d.personId)}</span>
                <span className={styles.rowMeta}>{d.reason}</span>
                <span className={`${styles.rowMeta} num`}>
                  {showDate(d.paidOn ?? d.occurredOn).slice(0, 5)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {total > HISTORY_PREVIEW && (
        <button type="button" className={styles.linkButton} onClick={() => setAll((v) => !v)}>
          {all ? t('cakes.showLess') : t('cakes.showAll', { count: total })}
        </button>
      )}
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
