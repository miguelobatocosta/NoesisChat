import { APP_NAME } from '@pausa/shared';
import { t } from '../i18n';
import { BrandHeader } from '../ui/BrandHeader';
import styles from './App.module.css';

/** Phase 1: branded empty shell. The chat layout replaces <main> in Phase 3. */
export function App() {
  return (
    <div className={styles.app}>
      <BrandHeader />
      <main className={styles.main}>
        <section className={styles.card}>
          <h1 className={styles.title}>{APP_NAME}</h1>
          <p className={styles.tagline}>{t('shell.tagline')}</p>
          <p className={`${styles.status} num`}>{t('shell.status', { phase: 1, total: 6 })}</p>
        </section>
      </main>
    </div>
  );
}
