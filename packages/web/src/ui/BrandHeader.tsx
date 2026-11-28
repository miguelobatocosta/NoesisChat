import type { ReactNode } from 'react';
import { APP_NAME, BRAND_WORDMARK } from '@pausa/shared';
import { t } from '../i18n';
import styles from './BrandHeader.module.css';
import { ThemeToggle } from './ThemeToggle';

/**
 * Brand header (BRAND.md §5). Text placeholder until the official logo is approved (BRAND.md §6, D-01).
 * Inside the app the theme lives in the account menu (D-57); the sign-in pages keep it here.
 */
export function BrandHeader({
  children,
  center,
  theme = true,
}: {
  children?: ReactNode;
  center?: ReactNode;
  theme?: boolean;
}) {
  return (
    <header className={styles.header} aria-label={t('header.label', { app: APP_NAME })}>
      <div className={styles.brand}>
        <span className={styles.wordmark}>{BRAND_WORDMARK}</span>
        <span className={styles.divider} aria-hidden="true" />
        <span className={styles.appName}>{APP_NAME}</span>
      </div>
      {center && <div className={styles.center}>{center}</div>}
      <div className={styles.right}>
        {children}
        {theme && <ThemeToggle />}
      </div>
    </header>
  );
}
