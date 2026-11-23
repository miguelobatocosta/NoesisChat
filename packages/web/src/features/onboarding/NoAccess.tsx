import { APP_NAME } from '@pausa/shared';
import { t } from '../../i18n';
import buttons from '../../ui/buttons.module.css';
import styles from './Onboarding.module.css';

export function NoAccess({ revoked = false }: { revoked?: boolean }) {
  return (
    <section className={styles.card}>
      <h1 className={styles.title}>{revoked ? t('noAccess.revokedTitle') : t('noAccess.title')}</h1>
      <p className={styles.subtitle}>
        {revoked ? t('noAccess.revokedBody') : t('noAccess.body', { app: APP_NAME })}
      </p>
      {revoked && (
        <button
          type="button"
          className={buttons.primary}
          onClick={() => window.location.assign('/')}
        >
          {t('noAccess.reload')}
        </button>
      )}
    </section>
  );
}
