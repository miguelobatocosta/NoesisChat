import { useState } from 'react';
import { Menu } from 'lucide-react';
import type { CommunityState, OfficeWeek } from '@pausa/shared';
import { t } from '../../i18n';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import forms from '../../ui/forms.module.css';
import styles from './Community.module.css';
import { attendanceStats, dateInWeek, excuses, goingIds, showDate, weekdayOf } from './selectors';

const WEEKDAYS = [1, 2, 3, 4, 5] as const;
const dayLabel = (iso: string) =>
  t('office.dayLabel', {
    weekday: t(`office.weekdays.${weekdayOf(iso) as 1 | 2 | 3 | 4 | 5}`),
    date: showDate(iso).slice(0, 5),
  });

function useMe() {
  const me = useChat((s) => s.me);
  const community = useChat((s) => s.community);
  const person = community?.people.find((p) => p.userId === me.id);
  return { me, person, staff: me.role === 'host' || me.role === 'admin' };
}

/** 🏢 Escritório (D-54): the weekly vote, the chosen day, check-in, history and the book of excuses. */
export function OfficePage({ onOpenRooms }: { onOpenRooms: () => void }) {
  const community = useChat((s) => s.community);
  return (
    <section className={styles.page} aria-labelledby="office-title">
      <header className={styles.header}>
        <button
          type="button"
          className={`${buttons.icon} ${styles.roomsButton}`}
          aria-label={t('room.openRooms')}
          onClick={onOpenRooms}
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden />
        </button>
        <h1 id="office-title" className={styles.title}>
          {t('office.title')}
        </h1>
      </header>
      <div className={styles.scroll}>
        {!community ? (
          <p className={styles.muted}>{t('boot.loading')}</p>
        ) : (
          <div className={styles.grid}>
            {community.days.some((d) => d.date === community.today) && <Today c={community} />}
            {community.weeks.map((w) => (
              <Week key={w.weekStart} c={community} week={w} />
            ))}
            {community.weeks.length === 0 && (
              <section className={styles.card}>
                <p className={styles.muted}>{t('office.noWeek')}</p>
              </section>
            )}
            <Stats c={community} />
            <Excuses c={community} />
            <ExtraDay c={community} />
          </div>
        )}
      </div>
    </section>
  );
}

/** Vote while open; once decided, who's going and my "Vou" / "Não vou". */
export function Week({
  c,
  week,
  compact = false,
}: {
  c: CommunityState;
  week: OfficeWeek;
  compact?: boolean;
}) {
  const { person: mine, staff } = useMe();
  const store = getStore();
  const myVotes = week.votes.filter((v) => v.personId === mine?.id).map((v) => v.weekday);
  const title = t('office.weekOf', { date: showDate(week.weekStart).slice(0, 5) });

  if (week.status === 'voting') {
    return (
      <section className={styles.card} aria-label={title}>
        {!compact && <h2 className={styles.cardTitle}>{title}</h2>}
        <p className={styles.muted}>{t('office.voteHint')}</p>
        <ul className={styles.rows}>
          {WEEKDAYS.map((wd) => {
            const voters = week.votes.filter((v) => v.weekday === wd);
            const checked = myVotes.includes(wd);
            return (
              <li key={wd} className={styles.row}>
                <label className={forms.check}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!mine}
                    onChange={() =>
                      void store.act('office:vote', {
                        weekStart: week.weekStart,
                        weekdays: checked ? myVotes.filter((d) => d !== wd) : [...myVotes, wd],
                      })
                    }
                  />
                  <span>{dayLabel(dateInWeek(week.weekStart, wd))}</span>
                </label>
                <span className={`${styles.rowMeta} num`}>
                  {t('office.votes', { count: voters.length })}
                  {voters.length > 0 &&
                    ` · ${voters.map((v) => c.people.find((p) => p.id === v.personId)?.name ?? '?').join(', ')}`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  const date = week.chosenOn!;
  const going = goingIds(c, date);
  const mineAtt = c.attendance.find((a) => a.date === date && a.personId === mine?.id);
  const notGoing = c.attendance.filter((a) => a.date === date && a.plan === 'not_going');
  const cake = c.debts.filter((d) => d.pledgedOn === date && d.status === 'owed');
  const upcoming = date >= c.today;
  const nameOf = (id: string) => c.people.find((p) => p.id === id)?.name ?? '?';

  return (
    <section className={styles.card} aria-label={title}>
      {!compact && <h2 className={styles.cardTitle}>{title}</h2>}
      <p className={styles.rowTitle}>{t('office.chosen', { day: dayLabel(date) })}</p>
      <p className={styles.muted}>
        {t('office.going', { count: going.length })}
        {going.length > 0 && `: ${going.map(nameOf).join(', ')}`}
      </p>
      {notGoing.length > 0 && (
        <p className={styles.muted}>
          {t('office.notGoing', {
            names: notGoing
              .map((a) => `${nameOf(a.personId)}${a.planReason ? ` (${a.planReason})` : ''}`)
              .join(', '),
          })}
        </p>
      )}
      <p className={styles.muted}>
        {cake.length
          ? t('office.cake', { names: cake.map((d) => nameOf(d.personId)).join(', ') })
          : t('office.noCake')}
      </p>
      {upcoming && mine && <PlanButtons date={date} current={mineAtt?.plan ?? null} />}
      {!compact && staff && upcoming && (
        <label className={forms.field}>
          <span className={forms.label}>{t('office.changeDay')}</span>
          <select
            className={forms.select}
            value={date}
            onChange={(e) =>
              void store.act('admin:office:setDay', {
                weekStart: week.weekStart,
                date: e.target.value,
              })
            }
          >
            {WEEKDAYS.map((wd) => {
              const d = dateInWeek(week.weekStart, wd);
              return (
                <option key={wd} value={d}>
                  {dayLabel(d)}
                </option>
              );
            })}
          </select>
        </label>
      )}
    </section>
  );
}

export function PlanButtons({
  date,
  current,
}: {
  date: string;
  current: 'going' | 'not_going' | null;
}) {
  const store = getStore();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <div className={styles.inline}>
      <button
        type="button"
        className={current === 'going' ? buttons.primary : buttons.secondary}
        aria-pressed={current === 'going'}
        onClick={() => void store.act('office:plan', { date, plan: 'going' })}
      >
        {t('office.imGoing')}
      </button>
      {!asking ? (
        <button
          type="button"
          className={current === 'not_going' ? buttons.primary : buttons.secondary}
          aria-pressed={current === 'not_going'}
          onClick={() => setAsking(true)}
        >
          {t('office.notGoingButton')}
        </button>
      ) : (
        <form
          className={styles.inline}
          onSubmit={(e) => {
            e.preventDefault();
            void store
              .act('office:plan', {
                date,
                plan: 'not_going',
                ...(reason.trim() ? { reason: reason.trim() } : {}),
              })
              .then(() => setAsking(false));
          }}
        >
          <label className={forms.field}>
            <span className={forms.label}>{t('office.why')}</span>
            <input
              className={forms.input}
              value={reason}
              maxLength={120}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button type="submit" className={buttons.primary}>
            {t('office.notGoingButton')}
          </button>
        </form>
      )}
    </div>
  );
}

/** On the day: check in, mark others, excuses, cake arrived. */
function Today({ c }: { c: CommunityState }) {
  const { person: mine, staff } = useMe();
  const store = getStore();
  const date = c.today;
  const day = c.days.find((d) => d.date === date)!;
  const team = c.people.filter((p) => p.inTeam);
  const att = (id: string) => c.attendance.find((a) => a.date === date && a.personId === id);
  const iAmThere = mine && att(mine.id)?.status === 'present';
  const cake = c.debts.filter((d) => d.pledgedOn === date && d.status === 'owed');
  const [excuse, setExcuse] = useState('');

  return (
    <section className={`${styles.card} ${styles.wide}`} aria-labelledby="office-today">
      <h2 id="office-today" className={styles.cardTitle}>
        {t('office.today', { day: dayLabel(date) })}
      </h2>
      {mine && !iAmThere && !day.closed && (
        <div className={styles.inline}>
          <button
            type="button"
            className={buttons.accent}
            onClick={() => void store.act('office:checkin', { date })}
          >
            {t('office.checkin')}
          </button>
        </div>
      )}
      <ul className={styles.rows}>
        {team.map((p) => {
          const a = att(p.id);
          const status =
            a?.status === 'present'
              ? t('office.present')
              : a?.status === 'absent'
                ? t('office.absent')
                : '—';
          return (
            <li key={p.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>{p.name}</span>
                <span className={styles.rowMeta}>
                  {status}
                  {a?.excuse && ` · ${a.excuse}`}
                </span>
              </div>
              {(iAmThere || staff) && p.id !== mine?.id && (
                <button
                  type="button"
                  className={buttons.ghost}
                  onClick={() =>
                    void store.act('office:mark', {
                      date,
                      personId: p.id,
                      status: a?.status === 'present' ? 'absent' : 'present',
                    })
                  }
                >
                  {a?.status === 'present' ? t('office.markAbsent') : t('office.markPresent')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {cake.map((d) => (
        <div key={d.id} className={styles.inline}>
          <span className={styles.rowMeta}>
            {t('office.cakeToday', {
              name: c.people.find((p) => p.id === d.personId)?.name ?? '?',
              reason: d.reason,
            })}
          </span>
          {d.personId !== mine?.id && (
            <button
              type="button"
              className={buttons.secondary}
              onClick={() => void store.act('cakes:paid', { debtId: d.id })}
            >
              {t('cakes.paid')}
            </button>
          )}
        </div>
      ))}
      {mine && !iAmThere && (
        <form
          className={styles.inline}
          onSubmit={(e) => {
            e.preventDefault();
            void store
              .act('office:excuse', { date, excuse: excuse.trim() })
              .then((ok) => ok && setExcuse(''));
          }}
        >
          <label className={forms.field}>
            <span className={forms.label}>{t('office.myExcuse')}</span>
            <input
              className={forms.input}
              value={excuse}
              minLength={2}
              maxLength={160}
              onChange={(e) => setExcuse(e.target.value)}
              required
            />
          </label>
          <button type="submit" className={buttons.secondary}>
            {t('office.sendExcuse')}
          </button>
        </form>
      )}
    </section>
  );
}

function Stats({ c }: { c: CommunityState }) {
  const { staff } = useMe();
  const store = getStore();
  const stats = attendanceStats(c);
  const pendingJudgements = c.attendance.filter((a) => a.judgement === 'pending');
  const nameOf = (id: string) => c.people.find((p) => p.id === id)?.name ?? '?';
  return (
    <section className={styles.card} aria-labelledby="office-stats">
      <h2 id="office-stats" className={styles.cardTitle}>
        {t('office.statsTitle')}
      </h2>
      <p className={styles.muted}>{t('office.statsHint', { limit: c.settings.noshowLimit })}</p>
      <ul className={styles.rows}>
        {stats.map((s) => (
          <li key={s.person.id} className={styles.row}>
            <span className={styles.rowTitle}>{s.person.name}</span>
            <span className={`${styles.rowMeta} num`}>
              {t('office.statsRow', {
                present: s.present,
                total: s.total,
                towards: s.towards,
                limit: c.settings.noshowLimit,
              })}
            </span>
          </li>
        ))}
      </ul>
      {staff && pendingJudgements.length > 0 && (
        <>
          <h3 className={styles.cardTitle}>{t('office.toJudge')}</h3>
          <ul className={styles.rows}>
            {pendingJudgements.map((a) => (
              <li key={`${a.date}:${a.personId}`} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>{nameOf(a.personId)}</span>
                  <span className={styles.rowMeta}>
                    {showDate(a.date)} · {a.excuse}
                  </span>
                </div>
                <button
                  type="button"
                  className={buttons.secondary}
                  onClick={() =>
                    void store.act('admin:office:judge', {
                      date: a.date,
                      personId: a.personId,
                      judgement: 'justified',
                    })
                  }
                >
                  {t('office.justify')}
                </button>
                <button
                  type="button"
                  className={buttons.ghost}
                  onClick={() =>
                    void store.act('admin:office:judge', {
                      date: a.date,
                      personId: a.personId,
                      judgement: 'unjustified',
                    })
                  }
                >
                  {t('office.unjustify')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Excuses({ c }: { c: CommunityState }) {
  const list = excuses(c).slice(0, 20);
  const nameOf = (id: string) => c.people.find((p) => p.id === id)?.name ?? '?';
  return (
    <section className={styles.card} aria-labelledby="office-excuses">
      <h2 id="office-excuses" className={styles.cardTitle}>
        {t('office.excusesTitle')}
      </h2>
      <ul className={styles.rows}>
        {list.length === 0 && <li className={styles.muted}>{t('office.noExcuses')}</li>}
        {list.map((e) => (
          <li key={`${e.date}:${e.personId}`} className={styles.row}>
            <div className={styles.rowMain}>
              <span>{t('office.quote', { text: e.text })}</span>
              <span className={`${styles.rowMeta} num`}>
                {nameOf(e.personId)} · {showDate(e.date)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ExtraDay({ c }: { c: CommunityState }) {
  const { staff } = useMe();
  const store = getStore();
  const [date, setDate] = useState(c.today);
  if (!staff) return null;
  return (
    <section className={styles.card} aria-labelledby="office-extra">
      <h2 id="office-extra" className={styles.cardTitle}>
        {t('office.extraTitle')}
      </h2>
      <form
        className={styles.inline}
        onSubmit={(e) => {
          e.preventDefault();
          void store.act('admin:office:addDay', { date });
        }}
      >
        <label className={forms.field}>
          <span className={forms.label}>{t('office.extraDate')}</span>
          <input
            className={forms.input}
            type="date"
            min={c.today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <button type="submit" className={buttons.secondary}>
          {t('office.extraAdd')}
        </button>
      </form>
    </section>
  );
}
