import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { t } from '../../i18n';
import { useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import styles from './Community.module.css';

/** The frame both pages share: the phone's rooms button, the title, one header action, the scroll. */
export function CommunityPage({
  id,
  title,
  action,
  onOpenRooms,
  children,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  onOpenRooms: () => void;
  children: ReactNode;
}) {
  const loaded = useChat((s) => s.community !== null);
  return (
    <section className={styles.page} aria-labelledby={id}>
      <header className={styles.header}>
        <button
          type="button"
          className={`${buttons.icon} ${styles.roomsButton}`}
          aria-label={t('room.openRooms')}
          onClick={onOpenRooms}
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden />
        </button>
        <h1 id={id} className={styles.title}>
          {title}
        </h1>
        {action}
      </header>
      <div className={styles.scroll}>
        {loaded ? children : <p className={styles.muted}>{t('boot.loading')}</p>}
      </div>
    </section>
  );
}
