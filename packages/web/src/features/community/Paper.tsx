import type { ReactNode } from 'react';
import { t } from '../../i18n';
import styles from './Community.module.css';
import { weekdayName } from './selectors';

/**
 * The two paper objects of the hero band (Phase 20): a pastelaria "senha" for the next cake and a
 * tear-off desk calendar page for the office day. Real things from the team's world, so the one
 * fact that matters on each page reads at a glance.
 */

export function Senha({
  number,
  year,
  children,
}: {
  number: number;
  year: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.senha}>
      <p className={styles.senhaHead}>{t('cakes.senha')}</p>
      <p className={styles.senhaLabel}>{t('cakes.ticketNumber')}</p>
      <p className={`${styles.senhaNumber} num`}>{number}</p>
      <p className={styles.senhaLabel}>{t('cakes.ticketYear', { year })}</p>
      <div className={styles.senhaStub}>{children}</div>
    </div>
  );
}

type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** A desk calendar page: weekday on the band, the day huge, the month under it. */
export function DeskCalendar({ date }: { date: string | null }) {
  if (!date) {
    return (
      <div className={styles.calendarPage} aria-hidden="true">
        <span className={styles.calendarBand}>&nbsp;</span>
        <span className={`${styles.calendarNumber} num`}>?</span>
        <span className={styles.calendarMonth}>&nbsp;</span>
      </div>
    );
  }
  const [, m, d] = date.split('-').map(Number) as [number, Month, number];
  return (
    <div className={styles.calendarPage} aria-hidden="true">
      <span className={styles.calendarBand}>{weekdayName(date)}</span>
      <span className={`${styles.calendarNumber} num`}>{d}</span>
      <span className={styles.calendarMonth}>{t(`office.months.${m}`)}</span>
    </div>
  );
}
