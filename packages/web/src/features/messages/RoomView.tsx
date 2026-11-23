import { type DragEvent, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { t } from '../../i18n';
import { useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import { Composer, type ComposerHandle } from '../composer/Composer';
import { MessageList } from './MessageList';
import styles from './RoomView.module.css';
import { TypingIndicator } from './TypingIndicator';

export function RoomView({
  roomId,
  onOpenSettings,
}: {
  roomId: string;
  onOpenSettings: () => void;
}) {
  const room = useChat((s) => s.rooms[roomId]);
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
        <span className={styles.icon} aria-hidden="true">
          {room.emoji ?? '#'}
        </span>
        <h1 className={styles.name}>{room.name}</h1>
        {room.description && <p className={styles.description}>{room.description}</p>}
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
      <Composer ref={composer} roomId={roomId} roomName={room.name} disabled={archived} />
    </section>
  );
}
