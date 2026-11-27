import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Message } from '@pausa/shared';
import { errorCode } from '../../api/errors';
import { t } from '../../i18n';
import { formatFull } from '../../lib/format';
import { plainText } from '../../lib/plaintext';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import { Dialog } from '../../ui/Dialog';
import forms from '../../ui/forms.module.css';
import styles from './SearchDialog.module.css';

const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const DEBOUNCE_MS = 250;

/** Bolds the words that start with a searched term, ignoring accents. Plain React text, no HTML. */
function highlight(text: string, query: string) {
  const terms = (query.match(/[\p{L}\p{N}]+/gu) ?? []).map(fold);
  return text
    .split(/([\p{L}\p{N}]+)/u)
    .map((part, i) =>
      terms.some((term) => fold(part).startsWith(term)) ? (
        <strong key={i}>{part}</strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}

interface Results {
  q: string;
  messages: Message[];
  hasMore: boolean;
}

/** Ctrl+Shift+F: full-text search over every room, newest first. Clicking a result jumps to it. */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const store = getStore();
  const rooms = useChat((s) => s.rooms);
  const members = useChat((s) => s.members);
  const activeRoomId = useChat((s) => s.activeRoomId);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'room'>('all');
  const [userId, setUserId] = useState('');
  const [results, setResults] = useState<Results>({ q: '', messages: [], hasMore: false });
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(
    () =>
      Object.values(members)
        .filter((m) => !m.isBot)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-PT')),
    [members],
  );
  const filters = useMemo(
    () => ({
      ...(scope === 'room' ? { roomId: activeRoomId } : {}),
      ...(userId ? { userId } : {}),
    }),
    [scope, activeRoomId, userId],
  );

  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      store
        .admin('search:messages', { query: q, ...filters })
        .then((res) => {
          setResults({ q, ...res });
          setError(null);
        })
        .catch((err: unknown) => setError(t(`errors.${errorCode(err)}`)));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, filters, store]);

  const shown = q.length >= 2 && results.q === q ? results : null;

  function more() {
    const last = shown?.messages.at(-1);
    if (!last) return;
    void store
      .admin('search:messages', { query: q, ...filters, before: last.id })
      .then((res) =>
        setResults((cur) => ({
          q,
          messages: [...cur.messages, ...res.messages],
          hasMore: res.hasMore,
        })),
      )
      .catch((err: unknown) => setError(t(`errors.${errorCode(err)}`)));
  }

  function open(m: Message) {
    onClose();
    void store.jumpTo(m.roomId, m.id);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('search.title')}
      closeLabel={t('rules.close')}
      size="md"
    >
      <input
        className={forms.input}
        type="search"
        value={query}
        autoFocus
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className={styles.filters}>
        <label className={forms.field}>
          <span className={forms.label}>{t('search.where')}</span>
          <select
            className={forms.select}
            value={scope}
            onChange={(e) => setScope(e.target.value as 'all' | 'room')}
          >
            <option value="all">{t('search.allRooms')}</option>
            <option value="room">
              {t('search.thisRoom', { room: rooms[activeRoomId]?.name ?? '' })}
            </option>
          </select>
        </label>
        <label className={forms.field}>
          <span className={forms.label}>{t('search.who')}</span>
          <select
            className={forms.select}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">{t('search.anyone')}</option>
            {people.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className={forms.error} role="alert">
          {error}
        </p>
      )}
      <ul className={styles.results} aria-label={t('search.results')}>
        {q.length < 2 && <li className={styles.none}>{t('search.hint')}</li>}
        {shown && shown.messages.length === 0 && (
          <li className={styles.none}>{t('search.none')}</li>
        )}
        {shown?.messages.map((m) => (
          <li key={m.id}>
            <button type="button" className={styles.result} onClick={() => open(m)}>
              <span className={styles.meta}>
                <span className={styles.author}>{store.nameOf(m.userId)}</span>
                <span>{`#${rooms[m.roomId]?.name ?? '?'}`}</span>
                <time className="num" dateTime={new Date(m.createdAt).toISOString()}>
                  {formatFull(m.createdAt)}
                </time>
              </span>
              <span className={styles.snippet}>
                {highlight(
                  plainText(m.body, (id) => store.nameOf(id), 220),
                  q,
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {shown?.hasMore && (
        <button type="button" className={buttons.secondary} onClick={more}>
          {t('search.more')}
        </button>
      )}
    </Dialog>
  );
}
