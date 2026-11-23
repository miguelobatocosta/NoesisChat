import { useMemo } from 'react';
import { t } from '../../i18n';
import { getStore, useChat } from '../../state/store';
import styles from './TypingIndicator.module.css';

export function TypingIndicator({ roomId }: { roomId: string }) {
  const typing = useChat((s) => s.typing[roomId]);
  const members = useChat((s) => s.members);
  const text = useMemo(() => {
    const names = Object.keys(typing ?? {}).map(
      (id) => members[id]?.displayName ?? getStore().nameOf(id),
    );
    if (names.length === 0) return '';
    if (names.length === 1) return t('typing.one', { a: names[0]! });
    if (names.length === 2) return t('typing.two', { a: names[0]!, b: names[1]! });
    return t('typing.many');
  }, [typing, members]);

  return (
    <div className={styles.typing} aria-live="polite">
      {text}
    </div>
  );
}
