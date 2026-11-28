import type { CommunityState, MessageCard } from '@pausa/shared';
import { t } from '../../i18n';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import styles from './Community.module.css';
import { useMe, useNameOf } from './hooks';
import { Week } from './OfficePage';
import { goingIds, showDate } from './selectors';

/**
 * The interactive part of a mascot's community post (D-53/D-54). Rendered from live state, so a
 * "Confirmo" disappears for everyone once someone confirms, and vote counts move as people vote.
 */
export function CommunityCard({ card }: { card: MessageCard }) {
  const community = useChat((s) => s.community);
  if (!community) return null;
  switch (card.type) {
    case 'officePoll':
    case 'officeDay':
      return <OfficeCard c={community} card={card} />;
    case 'cakeCall':
      return <CakeCallCard c={community} date={card.ref} />;
    default:
      return <DebtCard c={community} debtId={card.ref} />;
  }
}

function DebtCard({ c, debtId }: { c: CommunityState; debtId: string }) {
  const { me, staff } = useMe();
  const store = getStore();
  const debt = c.debts.find((d) => d.id === debtId);
  const status = !debt ? t('cards.gone') : t(`cards.status.${debt.status}`);
  const person = debt && c.people.find((p) => p.id === debt.personId);
  const mine = !!person && person.userId === me.id;
  const canConfirm = debt?.status === 'pending' && (debt.recordedBy !== me.id || mine || staff);

  return (
    <div className={styles.chatCard}>
      <div className={styles.chatCardRow}>
        <span className={styles.chatCardText}>
          {debt && person
            ? `${person.name} · ${debt.reason} · ${showDate(debt.occurredOn)} — `
            : ''}
          <strong>{status}</strong>
        </span>
        {canConfirm && (
          <button
            type="button"
            className={buttons.primary}
            onClick={() => void store.act('cakes:confirm', { debtId: debt.id })}
          >
            {t('cakes.confirm')}
          </button>
        )}
        <button type="button" className={buttons.ghost} onClick={() => store.openPage('cakes')}>
          {t('cards.openCakes')}
        </button>
      </div>
    </div>
  );
}

/** The vote (officePoll → a week) or a decided day (officeDay → a date), live. */
function OfficeCard({ c, card }: { c: CommunityState; card: MessageCard }) {
  const store = getStore();
  const week =
    card.type === 'officePoll'
      ? c.weeks.find((w) => w.weekStart === card.ref)
      : c.weeks.find((w) => w.chosenOn === card.ref);
  const day = c.days.find((d) => d.date === card.ref);
  const { person: mine } = useMe();
  const isToday = card.ref === c.today;
  const present =
    !!mine &&
    c.attendance.some(
      (a) => a.date === c.today && a.personId === mine.id && a.status === 'present',
    );

  return (
    <div className={styles.chatCard}>
      {week && <Week c={c} week={week} compact />}
      {!week && day && (
        <p className={styles.chatCardText}>
          {t('office.going', { count: goingIds(c, day.date).length })} · {showDate(day.date)}
        </p>
      )}
      {!week && !day && <p className={styles.chatCardText}>{t('cards.officeOver')}</p>}
      <div className={styles.chatCardRow}>
        {isToday && day && !day.closed && mine && !present && (
          <button
            type="button"
            className={buttons.accent}
            onClick={() => void store.act('office:checkin', { date: c.today })}
          >
            {t('office.checkin')}
          </button>
        )}
        <button type="button" className={buttons.ghost} onClick={() => store.openPage('office')}>
          {t('cards.openOffice')}
        </button>
      </div>
    </div>
  );
}

function CakeCallCard({ c, date }: { c: CommunityState; date: string }) {
  const store = getStore();
  const cake = c.debts.filter(
    (d) => d.pledgedOn === date || (d.paidOn === date && d.status === 'paid'),
  );
  const nameOf = useNameOf();
  return (
    <div className={styles.chatCard}>
      <div className={styles.chatCardRow}>
        <span className={styles.chatCardText}>
          {cake.length
            ? cake
                .map(
                  (d) => `${nameOf(d.personId)} · ${d.reason} — ${t(`cards.status.${d.status}`)}`,
                )
                .join('; ')
            : t('cards.gone')}
        </span>
        <button type="button" className={buttons.ghost} onClick={() => store.openPage('cakes')}>
          {t('cards.openCakes')}
        </button>
      </div>
    </div>
  );
}
