import { t } from '../i18n';
import { THEME_PREFERENCES, useTheme } from '../theme';
import styles from './ThemeToggle.module.css';

export function ThemeToggle() {
  const [pref, setPref] = useTheme();

  return (
    <div className={styles.group} role="radiogroup" aria-label={t('theme.label')}>
      {THEME_PREFERENCES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={pref === option}
          className={styles.option}
          onClick={() => setPref(option)}
        >
          {t(`theme.${option}`)}
        </button>
      ))}
    </div>
  );
}
