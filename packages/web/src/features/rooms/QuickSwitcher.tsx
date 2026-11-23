import { useMemo, useState } from 'react';
import { t } from '../../i18n';
import { getStore, useChat } from '../../state/store';
import { Dialog } from '../../ui/Dialog';
import forms from '../../ui/forms.module.css';
import styles from './QuickSwitcher.module.css';

const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/** Ctrl+K: jump to any room by typing. */
export function QuickSwitcher({ onClose }: { onClose: () => void }) {
  const rooms = useChat((s) => s.rooms);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const results = useMemo(() => {
    const q = fold(query.trim());
    return Object.values(rooms)
      .filter((r) => !q || fold(r.name).includes(q) || r.slug.includes(q))
      .sort(
        (a, b) =>
          Number(!!a.archivedAt) - Number(!!b.archivedAt) ||
          b.unread - a.unread ||
          a.name.localeCompare(b.name, 'pt-PT'),
      )
      .slice(0, 8);
  }, [rooms, query]);

  function go(id: string) {
    getStore().selectRoom(id);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('switcher.title')}
      closeLabel={t('rules.close')}
      size="sm"
    >
      <input
        className={forms.input}
        value={query}
        autoFocus
        placeholder={t('switcher.placeholder')}
        aria-label={t('switcher.placeholder')}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setIndex((i) =>
              Math.max(0, Math.min(results.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))),
            );
          } else if (e.key === 'Enter' && results[index]) {
            e.preventDefault();
            go(results[index].id);
          }
        }}
      />
      <ul className={styles.results} role="listbox">
        {results.length === 0 && <li className={styles.none}>{t('switcher.none')}</li>}
        {results.map((r, i) => (
          <li
            key={r.id}
            role="option"
            aria-selected={i === index}
            className={styles.result}
            onMouseDown={() => go(r.id)}
          >
            <span aria-hidden="true">{r.emoji ?? '#'}</span>
            <span className={styles.name}>{r.name}</span>
            {r.unread > 0 && <span className={`${styles.badge} num`}>{r.unread}</span>}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
