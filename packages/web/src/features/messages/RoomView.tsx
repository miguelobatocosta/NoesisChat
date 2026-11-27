import { type DragEvent, useEffect, useRef, useState } from 'react';
import { Menu, Search, Settings } from 'lucide-react';
import { t } from '../../i18n';
import { useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import { Composer, type ComposerHandle } from '../composer/Composer';
import { Mascot } from '../mascots/Mascot';
import { MessageList } from './MessageList';
import styles from './RoomView.module.css';
import { TypingIndicator } from './TypingIndicator';

export function RoomView({
  roomId,
  onOpenSettings,
  onOpenRooms,
  onOpenSearch,
}: {
  roomId: string;
  onOpenSettings: () => void;
  /** Phone layout: pull out the rooms drawer. */
  onOpenRooms?: () => void;
  onOpenSearch?: () => void;
}) {
  const room = useChat((s) => s.rooms[roomId]);
  const muted = useMyMute(roomId);
  const composer = useRef<ComposerHandle>(null);
  const [dragging, setDragging] = useState(false);

  if (!room) return <section className={styles.room} />;
  const archived = room.archivedAt !== null;

  const onDragOver = (e: DragEvent) => {
    if (archived || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragging(true);
  };
  const onDrop = (e: DragEvent) => {
    if (archived) return;
    e.preventDefault();
    setDragging(false);
    composer.current?.addFiles([...e.dataTransfer.files]);
  };

  return (
    <section
      className={styles.room}
      aria-label={`#${room.name}`}
      onDragOver={onDragOver}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
      data-dragging={dragging || undefined}
    >
      <header className={styles.header}>
        <button
          type="button"
          className={`${buttons.icon} ${styles.roomsButton}`}
          aria-label={t('room.openRooms')}
          onClick={onOpenRooms}
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden />
        </button>
        {room.mascotKey ? (
          <Mascot mascot={room.mascotKey} size={40} className={styles.mascot} />
        ) : (
          <span className={styles.icon} aria-hidden="true">
            {room.emoji ?? '#'}
          </span>
        )}
        <h1 className={styles.name}>{room.name}</h1>
        {room.description && <p className={styles.description}>{room.description}</p>}
        <button
          type="button"
          className={buttons.icon}
          aria-label={t('search.open')}
          title={t('search.open')}
          onClick={onOpenSearch}
        >
          <Search size={18} strokeWidth={1.75} aria-hidden />
        </button>
        <button
          type="button"
          className={buttons.icon}
          aria-label={t('room.settings')}
          onClick={onOpenSettings}
        >
          <Settings size={18} strokeWidth={1.75} aria-hidden />
        </button>
      </header>

      {archived && <p className={styles.archived}>{t('room.archivedNotice')}</p>}

      <MessageList roomId={roomId} />
      <TypingIndicator roomId={roomId} />
      <Composer
        ref={composer}
        roomId={roomId}
        roomName={room.name}
        disabled={archived}
        muted={muted}
      />
    </section>
  );
}

/** My active mute in this room (D-51); clears itself when the time is up. */
function useMyMute(roomId: string): { until: number; topic: string } | null {
  const myId = useChat((s) => s.me.id);
  const standing = useChat((s) => s.standings[roomId]?.[myId]);
  const until = standing?.mutedUntil ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const left = until - Date.now();
    if (left <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(left + 500, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [until]);
  return until !== null && until > now ? { until, topic: standing?.mutedTopic ?? '' } : null;
}
