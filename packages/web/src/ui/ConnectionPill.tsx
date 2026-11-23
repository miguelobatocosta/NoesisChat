import { t } from '../i18n';
import { useChat } from '../state/store';
import styles from './ConnectionPill.module.css';

export function ConnectionPill() {
  const connection = useChat((s) => s.connection);
  const shutdown = useChat((s) => s.shutdown);
  const label = shutdown ? t('connection.shutdown') : t(`connection.${connection}`);
  return (
    <span
      className={styles.pill}
      data-state={shutdown ? 'offline' : connection}
      role="status"
      aria-live="polite"
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>
        {connection === 'connected' ? t('connection.connected') : label}
      </span>
    </span>
  );
}
