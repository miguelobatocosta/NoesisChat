import { useState } from 'react';
import { Menu } from 'lucide-react';
import { type CommunityState, mascotByKey, type OfficeWeek } from '@pausa/shared';
import { t } from '../../i18n';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import forms from '../../ui/forms.module.css';
import styles from './Community.module.css';
import { MascotSays, useHostMascot } from './MascotSays';
import { attendanceStats, dateInWeek, excuses, goingIds, showDate, weekdayOf } from './selectors';

const WEEKDAYS = [1, 2, 3, 4, 5] as const;
const weekdayName = (iso: string) => t(`office.weekdays.${weekdayOf(iso) as 1 | 2 | 3 | 4 | 5}`);
const dayLabel = (iso: string) =>
  t('office.dayLabel', { weekday: weekdayName(iso), date: showDate(iso).slice(0, 5) });

function useMe() {
  const me = useChat((s) => s.me);
  const community = useChat((s) => s.community);
  const person = community?.people.find((p) => p.userId === me.id);
  return { me, person, staff: me.role === 'host' || me.role === 'admin' };
}

/** 🏢 Escritório (D-54, Phase 19): the week as five columns, today's headcount, stats, excuses. */
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
          <>
            <Hero c={community} />
            {community.days.some((d) => d.date === community.today) && <Today c={community} />}
            {community.weeks.map((w) => (
              <Week key={w.weekStart} c={community} week={w} />
            ))}
            {community.weeks.length === 0 && (
              <section className={styles.card}>
                <p className={styles.muted}>{t('office.noWeek')}</p>
              </section>
            )}
            <div className={styles.layoutBottom}>
              <Stats c={community} />
              <Excuses c={community} />
            </div>
            <ExtraDay c={community} />
          </>
        )}
      </div>
    </section>
  );
}

function Hero({ c }: { c: CommunityState }) {
  const mascot = useHostMascot();
  const mascotName = useChat(
    (s) => s.members[mascotByKey(mascot).userId]?.displayName ?? mascotByKey(mascot).name,
  );
  const todayDay = c.days.find((d) => d.date === c.today && !d.closed);
  const voting = c.weeks.find((w) => w.status === 'voting');
  const decided = c.weeks.find(
    (w) => w.status === 'decided' && w.chosenOn && w.chosenOn >= c.today,
  );
  let line: string;
  if (todayDay) {
    const present = c.attendance.filter((a) => a.date === c.today && a.status === 'present').length;
    line = t(`bubble.${mascot}.today`, { count: present });
  } else if (decided?.chosenOn) {
    line = t(`bubble.${mascot}.decided`, {
      day: dayLabel(decided.chosenOn),
      count: goingIds(c, decided.chosenOn).length,
    });
  } else if (voting) {
    const counts = WEEKDAYS.map((wd) => voting.votes.filter((v) => v.weekday === wd).length);
    const best = counts.indexOf(Math.max(...counts));
    line = t(`bubble.${mascot}.voting`, {
      day: weekdayName(dateInWeek(voting.weekStart, best + 1)),
    });
  } else line = t(`bubble.${mascot}.none`);
  return (
    <div className={styles.hero}>
      <MascotSays mascot={mascot} line={line} name={mascotName} />
    </div>
  );
}

/**
 * A week as five day columns. While voting, each column is a button (vote/unvote) with a bar that
 * grows with its votes; once decided, the chosen day carries the 🏆. Also used compactly in chat cards.
 */
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
  const counts = WEEKDAYS.map((wd) => week.votes.filter((v) => v.weekday === wd).length);
  const max = Math.max(1, ...counts);
  const voting = week.status === 'voting';
  const title = t('office.weekOf', { date: showDate(week.weekStart).slice(0, 5) });
  const nameOf = (id: string) => c.people.find((p) => p.id === id)?.name ?? '?';

  const date = week.chosenOn;
  const going = date ? goingIds(c, date) : [];
  const notGoing = date
    ? c.attendance.filter((a) => a.date === date && a.plan === 'not_going')
    : [];
  const cake = date ? c.debts.filter((d) => d.pledgedOn === date && d.status === 'owed') : [];
  const myPlan = date
    ? (c.attendance.find((a) => a.date === date && a.personId === mine?.id)?.plan ?? null)
    : null;

  return (
    <section className={`${styles.card} ${compact ? styles.weekCompact : ''}`} aria-label={title}>
      {!compact && (
        <div className={styles.weekHead}>
          <h2 className={styles.cardTitle}>{title}</h2>
          <p className={styles.eyebrow}>
            {voting ? t('office.voteHintShort') : t('office.chosen', { day: dayLabel(date!) })}
          </p>
        </div>
      )}
      <ul className={styles.board}>
        {WEEKDAYS.map((wd, i) => {
          const d = dateInWeek(week.weekStart, wd);
          const voters = week.votes.filter((v) => v.weekday === wd).map((v) => nameOf(v.personId));
          const mineVoted = myVotes.includes(wd);
          const won = !voting && d === date;
          const body = (
            <>
              <span className={styles.boardDay}>{weekdayName(d)}</span>
              <span className={`${styles.boardDate} num`}>{showDate(d).slice(0, 5)}</span>
              <span className={styles.boardTrack} aria-hidden="true">
                <span
                  className={styles.boardBar}
                  style={{ height: `${(counts[i]! / max) * 100}%` }}
                />
              </span>
              <span className={`${styles.boardCount} num`}>
                {t('office.votes', { count: counts[i]! })}
              </span>
              {won && <span className={styles.boardWinner}>🏆 {t('office.winner')}</span>}
              {mineVoted && voting && (
                <span className={styles.boardMine}>{t('office.yourVote')}</span>
              )}
            </>
          );
          return (
            <li
              key={wd}
              className={styles.boardCol}
              data-won={won || undefined}
              data-mine={mineVoted || undefined}
              title={voters.join(', ')}
            >
              {voting && mine ? (
                <button
                  type="button"
                  className={styles.boardButton}
                  aria-pressed={mineVoted}
                  aria-label={`${dayLabel(d)}, ${t('office.votes', { count: counts[i]! })}`}
                  onClick={() =>
                    void store.act('office:vote', {
                      weekStart: week.weekStart,
                      weekdays: mineVoted ? myVotes.filter((x) => x !== wd) : [...myVotes, wd],
                    })
                  }
                >
                  {body}
                </button>
              ) : (
                <div className={styles.boardButton}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {date && (
        <div className={styles.weekFacts}>
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
          {date >= c.today && mine && <PlanButtons date={date} current={myPlan} />}
          {!compact && staff && date >= c.today && (
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
        </div>
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

/** On the day: the headcount, the big check-in, who's here, excuses, cake arrived. */
function Today({ c }: { c: CommunityState }) {
  const { person: mine, staff } = useMe();
  const store = getStore();
  const date = c.today;
  const day = c.days.find((d) => d.date === date)!;
  const team = c.people.filter((p) => p.inTeam);
  const att = (id: string) => c.attendance.find((a) => a.date === date && a.personId === id);
  const present = team.filter((p) => att(p.id)?.status === 'present').length;
  const iAmThere = mine && att(mine.id)?.status === 'present';
  const cake = c.debts.filter((d) => d.pledgedOn === date && d.status === 'owed');
  const [excuse, setExcuse] = useState('');

  return (
    <section className={`${styles.card} ${styles.today}`} aria-labelledby="office-today">
      <div className={styles.todayHead}>
        <h2 id="office-today" className={styles.cardTitle}>
          {t('office.today', { day: dayLabel(date) })}
        </h2>
        <p className={`${styles.capacity} num`}>
          {t('office.presentOf', { present, total: team.length })}
        </p>
        <div className={styles.capacityTrack} aria-hidden="true">
          <span
            className={styles.capacityFill}
            style={{ width: `${team.length ? (present / team.length) * 100 : 0}%` }}
          />
        </div>
        {mine && !iAmThere && !day.closed && (
          <button
            type="button"
            className={`${buttons.accent} ${styles.checkin}`}
            onClick={() => void store.act('office:checkin', { date })}
          >
            {t('office.checkin')}
          </button>
        )}
      </div>
      <ul className={styles.roster}>
        {team.map((p) => {
          const a = att(p.id);
          const state = a?.status ?? 'unknown';
          return (
            <li key={p.id} className={styles.rosterRow} data-state={state}>
              <span className={styles.rosterMark} aria-hidden="true">
                {state === 'present' ? '✔' : state === 'absent' ? '✗' : '…'}
              </span>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>{p.name}</span>
                <span className={styles.rowMeta}>
                  {state === 'present'
                    ? t('office.present')
                    : state === 'absent'
                      ? t('office.absent')
                      : t('office.missing')}
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
  const limit = c.settings.noshowLimit;
  const pendingJudgements = c.attendance.filter((a) => a.judgement === 'pending');
  const nameOf = (id: string) => c.people.find((p) => p.id === id)?.name ?? '?';
  return (
    <section className={styles.card} aria-labelledby="office-stats">
      <h2 id="office-stats" className={styles.cardTitle}>
        {t('office.statsTitle')}
      </h2>
      <p className={styles.eyebrow}>{t('office.statsHint', { limit })}</p>
      <ul className={styles.rows}>
        {stats.map((s) => (
          <li key={s.person.id} className={styles.row}>
            <div className={styles.rowMain}>
              <span className={styles.rowTitle}>{s.person.name}</span>
              <span className={`${styles.rowMeta} num`}>
                {t('office.statsRow', {
                  present: s.present,
                  total: s.total,
                  towards: s.towards,
                  limit,
                })}
              </span>
            </div>
            <span className={styles.strikes} aria-hidden="true">
              {Array.from({ length: limit }, (_, i) => (
                <span key={i} className={styles.strike} data-on={i < s.towards || undefined} />
              ))}
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
  const [featured, ...rest] = list;
  const nameOf = (id: string) => c.people.find((p) => p.id === id)?.name ?? '?';
  return (
    <section className={styles.card} aria-labelledby="office-excuses">
      <h2 id="office-excuses" className={styles.cardTitle}>
        {t('office.excusesTitle')}
      </h2>
      {!featured && <p className={styles.muted}>{t('office.noExcuses')}</p>}
      {featured && (
        <figure className={styles.featuredExcuse}>
          <p className={styles.eyebrow}>{t('office.featuredExcuse')}</p>
          <blockquote className={styles.quoteBig}>
            {t('office.quote', { text: featured.text })}
          </blockquote>
          <figcaption className={`${styles.rowMeta} num`}>
            {nameOf(featured.personId)} · {showDate(featured.date)}
          </figcaption>
        </figure>
      )}
      <ul className={styles.rows}>
        {rest.map((e) => (
          <li key={`${e.date}:${e.personId}`} className={styles.row}>
            <div className={styles.rowMain}>
              <span className={styles.quote}>{t('office.quote', { text: e.text })}</span>
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
    <section className={`${styles.card} ${styles.adminCard}`} aria-labelledby="office-extra">
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
