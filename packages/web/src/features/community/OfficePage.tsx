import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { CommunityState, OfficeWeek } from '@pausa/shared';
import { t } from '../../i18n';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import forms from '../../ui/forms.module.css';
import styles from './Community.module.css';
import { CommunityPage } from './CommunityPage';
import { useHostMascotName, useMe, useNameOf } from './hooks';
import { MascotSays } from './MascotSays';
import { DeskCalendar } from './Paper';
import {
  attendanceStats,
  dateInWeek,
  daysBetween,
  excuses,
  goingIds,
  nextOfficeDay,
  showDate,
  weekdayName,
} from './selectors';

const WEEKDAYS = [1, 2, 3, 4, 5] as const;
const dayLabel = (iso: string) =>
  t('office.dayLabel', { weekday: weekdayName(iso), date: showDate(iso).slice(0, 5) });

function countdown(today: string, date: string): string {
  const days = daysBetween(today, date);
  if (days === 0) return t('office.isToday');
  if (days === 1) return t('office.isTomorrow');
  return t('office.inDays', { days });
}

/**
 * 🏢 Escritório (D-54, Phase 20). The hero is a desk calendar page: today's headcount and check-in
 * on an office day, otherwise the next decided day and your Vou/Não vou. Voting, stats and the
 * excuse book follow; admin tools stay folded at the bottom.
 */
export function OfficePage({ onOpenRooms }: { onOpenRooms: () => void }) {
  const community = useChat((s) => s.community);
  const today = community?.days.find((d) => d.date === community.today);
  return (
    <CommunityPage id="office-title" title={t('office.title')} onOpenRooms={onOpenRooms}>
      {community && (
        <>
          {today ? <Today c={community} /> : <NextDay c={community} />}
          {community.weeks
            .filter((w) => w.status === 'voting')
            .map((w) => (
              <Week key={w.weekStart} c={community} week={w} />
            ))}
          <div className={styles.reference}>
            <Stats c={community} />
            <Excuses c={community} />
          </div>
          <AdminTools c={community} />
        </>
      )}
    </CommunityPage>
  );
}

/** What the #geral mascot says about the office right now. */
function useOfficeLine(c: CommunityState): {
  mascot: ReturnType<typeof useHostMascotName>['mascot'];
  name: string;
  line: string;
} {
  const { mascot, name } = useHostMascotName();
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
  return { mascot, name, line };
}

/** Not an office day today: the next one on the calendar page, who goes, and your answer. */
function NextDay({ c }: { c: CommunityState }) {
  const { mascot, name, line } = useOfficeLine(c);
  const { person: mine } = useMe();
  const nameOf = useNameOf();
  const next = nextOfficeDay(c);
  const date = next?.date ?? null;
  const going = date ? goingIds(c, date) : [];
  const notGoing = date
    ? c.attendance.filter((a) => a.date === date && a.plan === 'not_going')
    : [];
  const cake = date ? c.debts.filter((d) => d.pledgedOn === date && d.status === 'owed') : [];
  const myPlan = date
    ? (c.attendance.find((a) => a.date === date && a.personId === mine?.id)?.plan ?? null)
    : null;
  const voting = c.weeks.some((w) => w.status === 'voting');

  return (
    <section className={styles.hero} aria-labelledby="office-next">
      <DeskCalendar date={date} />
      <div className={styles.heroMain}>
        <h2 id="office-next" className={styles.heroEyebrow}>
          {t('office.nextTitle')}
        </h2>
        <p className={styles.heroDay}>{date ? dayLabel(date) : t('office.undecided')}</p>
        {date ? (
          <>
            <p className={`${styles.heroWhen} num`}>{countdown(c.today, date)}</p>
            <p className={styles.heroFact}>
              <strong className="num">{t('office.goingNames', { count: going.length })}</strong>
              {going.length > 0
                ? ` · ${going.map(nameOf).join(', ')}`
                : ` · ${t('office.nobodyGoing')}`}
            </p>
            {notGoing.length > 0 && (
              <p className={styles.heroFact}>
                {t('office.notGoing', {
                  names: notGoing
                    .map((a) => `${nameOf(a.personId)}${a.planReason ? ` (${a.planReason})` : ''}`)
                    .join(', '),
                })}
              </p>
            )}
            <p className={styles.heroFact}>
              {cake.length
                ? t('office.cake', { names: cake.map((d) => nameOf(d.personId)).join(', ') })
                : t('office.noCake')}
            </p>
            {mine && <PlanButtons date={date} current={myPlan} onHero />}
          </>
        ) : (
          <p className={styles.heroNote}>{voting ? t('office.voteHint') : t('office.noWeek')}</p>
        )}
      </div>
      <MascotSays mascot={mascot} line={line} name={name} />
    </section>
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
  const { person: mine } = useMe();
  const nameOf = useNameOf();
  const store = getStore();
  const myVotes = week.votes.filter((v) => v.personId === mine?.id).map((v) => v.weekday);
  const counts = WEEKDAYS.map((wd) => week.votes.filter((v) => v.weekday === wd).length);
  const max = Math.max(1, ...counts);
  const voting = week.status === 'voting';
  const title = t('office.weekOf', { date: showDate(week.weekStart).slice(0, 5) });

  const date = week.chosenOn;
  const going = date ? goingIds(c, date) : [];
  const cake = date ? c.debts.filter((d) => d.pledgedOn === date && d.status === 'owed') : [];
  const myPlan = date
    ? (c.attendance.find((a) => a.date === date && a.personId === mine?.id)?.plan ?? null)
    : null;

  return (
    <section className={compact ? styles.weekCompact : styles.section} aria-label={title}>
      {!compact && (
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>
            {t('office.votingTitle')} · {title}
          </h2>
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
      {date && compact && (
        <div className={styles.weekFacts}>
          <p className={styles.muted}>
            {t('office.going', { count: going.length })}
            {going.length > 0 && `: ${going.map(nameOf).join(', ')}`}
          </p>
          <p className={styles.muted}>
            {cake.length
              ? t('office.cake', { names: cake.map((d) => nameOf(d.personId)).join(', ') })
              : t('office.noCake')}
          </p>
          {date >= c.today && mine && <PlanButtons date={date} current={myPlan} />}
        </div>
      )}
    </section>
  );
}

function PlanButtons({
  date,
  current,
  onHero = false,
}: {
  date: string;
  current: 'going' | 'not_going' | null;
  onHero?: boolean;
}) {
  const store = getStore();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const chosen = onHero ? buttons.accent : buttons.primary;
  const other = onHero ? styles.heroButton : buttons.secondary;
  return (
    <div className={onHero ? styles.heroActions : styles.inline}>
      <button
        type="button"
        className={current === 'going' ? chosen : other}
        aria-pressed={current === 'going'}
        onClick={() => void store.act('office:plan', { date, plan: 'going' })}
      >
        {t('office.imGoing')}
      </button>
      {!asking ? (
        <button
          type="button"
          className={current === 'not_going' ? chosen : other}
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
            <span className={onHero ? styles.heroLabel : forms.label}>{t('office.why')}</span>
            <input
              className={onHero ? styles.heroInput : forms.input}
              value={reason}
              maxLength={120}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button type="submit" className={chosen}>
            {t('office.notGoingButton')}
          </button>
        </form>
      )}
    </div>
  );
}

/** On the day: the calendar page with the headcount and the big check-in; the roster below it. */
function Today({ c }: { c: CommunityState }) {
  const { mascot, name, line } = useOfficeLine(c);
  const { person: mine, staff } = useMe();
  const nameOf = useNameOf();
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
    <section className={styles.stack} aria-labelledby="office-today">
      <div className={styles.hero}>
        <DeskCalendar date={date} />
        <div className={styles.heroMain}>
          <h2 id="office-today" className={styles.heroEyebrow}>
            {t('office.today', { day: dayLabel(date) })}
          </h2>
          <p className={`${styles.heroBig} num`}>
            {t('office.presentOf', { present, total: team.length })}
          </p>
          <div className={styles.capacityTrack} aria-hidden="true">
            <span
              className={styles.capacityFill}
              style={{ width: `${team.length ? (present / team.length) * 100 : 0}%` }}
            />
          </div>
          {cake.map((d) => (
            <p key={d.id} className={styles.heroFact}>
              {t('office.cakeToday', { name: nameOf(d.personId), reason: d.reason })}
            </p>
          ))}
          <div className={styles.heroActions}>
            {mine && !iAmThere && !day.closed && (
              <button
                type="button"
                className={`${buttons.accent} ${styles.checkin}`}
                onClick={() => void store.act('office:checkin', { date })}
              >
                {t('office.checkin')}
              </button>
            )}
            {cake
              .filter((d) => d.personId !== mine?.id)
              .map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={styles.heroButton}
                  onClick={() => void store.act('cakes:paid', { debtId: d.id })}
                >
                  {t('cakes.paid')}
                </button>
              ))}
          </div>
        </div>
        <MascotSays mascot={mascot} line={line} name={name} />
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
  const stats = attendanceStats(c);
  const limit = c.settings.noshowLimit;
  return (
    <section className={styles.refBlock} aria-labelledby="office-stats">
      <h2 id="office-stats" className={styles.sectionTitle}>
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
    </section>
  );
}

function Excuses({ c }: { c: CommunityState }) {
  const nameOf = useNameOf();
  const list = excuses(c).slice(0, 20);
  const [featured, ...rest] = list;
  return (
    <section className={styles.refBlock} aria-labelledby="office-excuses">
      <h2 id="office-excuses" className={styles.sectionTitle}>
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

/** Extra day, change a decided day, judge excuses: folded away, with a count when there's work. */
function AdminTools({ c }: { c: CommunityState }) {
  const { staff } = useMe();
  const nameOf = useNameOf();
  const store = getStore();
  const [date, setDate] = useState(c.today);
  if (!staff) return null;
  const toJudge = c.attendance.filter((a) => a.judgement === 'pending');
  const upcoming = c.weeks.filter(
    (w) => w.status === 'decided' && w.chosenOn && w.chosenOn >= c.today,
  );
  return (
    <details className={styles.admin}>
      <summary className={styles.adminSummary}>
        <ChevronRight size={18} strokeWidth={1.75} aria-hidden className={styles.adminChevron} />
        {t('office.adminTools')}
        {toJudge.length > 0 && (
          <span className={`${styles.badgeText} num`}>
            {t('office.toJudgeCount', { count: toJudge.length })}
          </span>
        )}
      </summary>
      <div className={styles.adminBody}>
        <section aria-labelledby="office-extra">
          <h3 id="office-extra" className={styles.sectionTitle}>
            {t('office.extraTitle')}
          </h3>
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

        {upcoming.map((week) => (
          <section key={week.weekStart} aria-label={t('office.changeDay')}>
            <label className={forms.field}>
              <span className={forms.label}>
                {t('office.changeDay')} ·{' '}
                {t('office.weekOf', { date: showDate(week.weekStart).slice(0, 5) })}
              </span>
              <select
                className={forms.select}
                value={week.chosenOn!}
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
          </section>
        ))}

        {toJudge.length > 0 && (
          <section aria-labelledby="office-judge">
            <h3 id="office-judge" className={styles.sectionTitle}>
              {t('office.toJudge')}
            </h3>
            <ul className={styles.rows}>
              {toJudge.map((a) => (
                <li key={`${a.date}:${a.personId}`} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowTitle}>{nameOf(a.personId)}</span>
                    <span className={styles.rowMeta}>
                      {showDate(a.date)} · {a.excuse}
                    </span>
                  </div>
                  {(['justified', 'unjustified'] as const).map((judgement) => (
                    <button
                      key={judgement}
                      type="button"
                      className={judgement === 'justified' ? buttons.secondary : buttons.ghost}
                      onClick={() =>
                        void store.act('admin:office:judge', {
                          date: a.date,
                          personId: a.personId,
                          judgement,
                        })
                      }
                    >
                      {judgement === 'justified' ? t('office.justify') : t('office.unjustify')}
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </details>
  );
}
