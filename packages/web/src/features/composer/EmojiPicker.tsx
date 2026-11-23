import { useEffect, useMemo, useRef, useState } from 'react';
import { EMOJI, EMOJI_CATEGORIES, searchEmoji } from '../../lib/emoji';
import { t } from '../../i18n';
import styles from './EmojiPicker.module.css';

interface Props {
  onPick: (emoji: string) => void;
  onClose: () => void;
  align?: 'left' | 'right';
}

/** Bundled emoji picker: search + categories. Closes on Esc or outside click. */
export function EmojiPicker({ onPick, onClose, align = 'left' }: Props) {
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const results = useMemo(() => (query.trim() ? searchEmoji(query, 120) : null), [query]);

  return (
    <div
      className={styles.picker}
      data-align={align}
      ref={ref}
      role="dialog"
      aria-label={t('composer.emoji')}
    >
      <input
        ref={input}
        className={styles.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('emoji.search')}
        aria-label={t('emoji.search')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results?.[0]) {
            e.preventDefault();
            onPick(results[0].char);
          }
        }}
      />
      <div className={styles.grid}>
        {results ? (
          results.length ? (
            <div className={styles.cells}>
              {results.map((e) => (
                <button
                  key={e.code}
                  type="button"
                  className={styles.cell}
                  title={`:${e.code}:`}
                  aria-label={e.code}
                  onClick={() => onPick(e.char)}
                >
                  {e.char}
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.none}>{t('emoji.none')}</p>
          )
        ) : (
          EMOJI_CATEGORIES.map((cat) => (
            <section key={cat}>
              <h3 className={styles.category}>{t(`emoji.${cat}`)}</h3>
              <div className={styles.cells}>
                {EMOJI.filter((e) => e.category === cat).map((e) => (
                  <button
                    key={e.code}
                    type="button"
                    className={styles.cell}
                    title={`:${e.code}:`}
                    aria-label={e.code}
                    onClick={() => onPick(e.char)}
                  >
                    {e.char}
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
