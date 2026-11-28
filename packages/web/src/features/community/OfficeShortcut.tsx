import { t } from '../../i18n';
import { getStore, useChat } from '../../state/store';
import styles from './OfficeShortcut.module.css';
import { showDate, weekdayName } from './selectors';

/**
 * Top-bar shortcut (Phase 19): my answer for the next decided office day, one click from anywhere.
 * Hidden when there's no upcoming day.
 */
export function OfficeShortcut() {
  const community = useChat((s) => s.community);
  const me = useChat((s) => s.me);
  if (!community) return null;
  const next = community.days.find((d) => d.date >= community.today && !d.closed);
  const mine = community.people.find((p) => p.userId === me.id);
  if (!next || !mine) return null;
  const plan =
    community.attendance.find((a) => a.date === next.date && a.personId === mine.id)?.plan ?? null;
  const day = `${weekdayName(next.date)} ${showDate(next.date).slice(0, 5)}`;
  const store = getStore();

  return (
    <div className={styles.wrap} role="group" aria-label={t('header.office', { day })}>
      <button type="button" className={styles.day} onClick={() => store.openPage('office')}>
        <span aria-hidden="true">🏢</span> {day}
      </button>
      <button
        type="button"
        className={styles.choice}
        aria-pressed={plan === 'going'}
        onClick={() => void store.act('office:plan', { date: next.date, plan: 'going' })}
      >
        {t('header.going')}
      </button>
      <button
        type="button"
        className={styles.choice}
        aria-pressed={plan === 'not_going'}
        onClick={() => void store.act('office:plan', { date: next.date, plan: 'not_going' })}
      >
        {t('header.notGoing')}
      </button>
    </div>
  );
}
