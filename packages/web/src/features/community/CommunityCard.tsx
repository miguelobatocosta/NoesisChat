import type { MessageCard } from '@pausa/shared';
import { t } from '../../i18n';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import styles from './Community.module.css';
import { showDate } from './selectors';

/**
 * The interactive part of a mascot's community post (D-53). Rendered from live state, so a
 * "Confirmo" button disappears for everyone once someone confirms.
 */
export function CommunityCard({ card }: { card: MessageCard }) {
  const community = useChat((s) => s.community);
  const me = useChat((s) => s.me);
  const store = getStore();
  if (!community) return null;

  const debt = community.debts.find((d) => d.id === card.ref);
  const status = !debt ? t('cards.gone') : t(`cards.status.${debt.status}`);
  const person = debt && community.people.find((p) => p.id === debt.personId);
  const mine = !!person && person.userId === me.id;
  const staff = me.role === 'host' || me.role === 'admin';

  const canConfirm = debt?.status === 'pending' && (debt.recordedBy !== me.id || mine || staff);

  return (
    <div className={styles.chatCard}>
      <div className={styles.chatCardRow}>
        <span className={styles.chatCardText}>
          {debt && person ? `${person.name} · ${debt.reason} · ${showDate(debt.occurredOn)}` : ''}
          {debt && person && ' — '}
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
