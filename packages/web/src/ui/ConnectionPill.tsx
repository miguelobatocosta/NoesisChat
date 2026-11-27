import { t } from '../i18n';
import { useChat } from '../state/store';
import styles from './ConnectionPill.module.css';

/** Connection status, shown only when something's wrong (connected = nothing to say). */
export function ConnectionPill() {
  const connection = useChat((s) => s.connection);
  const shutdown = useChat((s) => s.shutdown);
  // The live region stays mounted so a later problem is still announced.
  const problem = shutdown || connection !== 'connected';
  return (
    <span
      className={styles.pill}
      data-state={shutdown ? 'offline' : connection}
      data-hidden={!problem || undefined}
      role="status"
      aria-live="polite"
    >
      {problem && (
        <>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.label}>
            {shutdown ? t('connection.shutdown') : t(`connection.${connection}`)}
          </span>
        </>
      )}
    </span>
  );
}
