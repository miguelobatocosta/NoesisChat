import { Search } from 'lucide-react';
import { t } from '../../i18n';
import styles from './HeaderSearch.module.css';

/**
 * The search field in the top bar. Typing opens the full search (SearchDialog) with what you typed;
 * on phones it's just the magnifier.
 */
export function HeaderSearch({ onOpen }: { onOpen: (query: string) => void }) {
  return (
    <div className={styles.wrap}>
      <label className={styles.field}>
        <Search size={16} strokeWidth={2} aria-hidden className={styles.icon} />
        <input
          className={styles.input}
          type="search"
          placeholder={t('header.search')}
          aria-label={t('header.search')}
          value=""
          onChange={(e) => onOpen(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onOpen('');
          }}
        />
        <kbd className={styles.kbd} aria-hidden="true">
          {t('header.searchShortcut')}
        </kbd>
      </label>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={t('search.open')}
        onClick={() => onOpen('')}
      >
        <Search size={20} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
