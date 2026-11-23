import { mascotByKey, mentionToken } from '@pausa/shared';
import { t } from '../../i18n';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import { Mascot } from './Mascot';
import styles from './EmptyRoom.module.css';

const WELCOMES = ['welcome1', 'welcome2', 'welcome3'] as const;

/** A room with no messages yet: its mascot, one funny line, one action (BRAND.md §5, D-49). */
export function EmptyRoom({ roomId }: { roomId: string }) {
  const room = useChat((s) => s.rooms[roomId]);
  const members = useChat((s) => s.members);
  if (!room) return null;

  const key = room.mascotKey;
  if (!key || !room.mascotEnabled) {
    return <p className={styles.plain}>{t('room.empty')}</p>;
  }

  const mascot = mascotByKey(key);
  const name = members[mascot.userId]?.displayName ?? mascot.name;
  // Stable per room, so the line doesn't change on every render.
  const welcome = WELCOMES[[...room.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 3]!;
  const archived = room.archivedAt !== null;

  return (
    <div className={styles.empty}>
      <Mascot mascot={key} size={128} className={styles.art} />
      <p className={styles.line}>{t(`mascots.${key}.${welcome}`, { room: room.slug })}</p>
      <p className={styles.who}>
        {name} · {t(`mascots.${key}.species`)}
      </p>
      {!archived && (
        <button
          type="button"
          className={buttons.primary}
          onClick={() =>
            getStore().send(roomId, `${t('mascots.hello')} ${mentionToken(mascot.userId)} 👋`, [])
          }
        >
          {t('mascots.sayHi')}
        </button>
      )}
    </div>
  );
}
