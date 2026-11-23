import { useEffect, useMemo, useRef, useState } from 'react';
import { EllipsisVertical, Plus } from 'lucide-react';
import { type Member, mascotByUserId, type RoomView } from '@pausa/shared';
import type { DialogName } from '../../app/ChatApp';
import { t } from '../../i18n';
import { getStore, useChat } from '../../state/store';
import { Mascot } from '../mascots/Mascot';
import { archivedRooms, hiddenRooms, visibleRooms } from './roomOrder';
import styles from './Sidebar.module.css';

export function Sidebar({ onOpen }: { onOpen: (d: DialogName) => void }) {
  const rooms = useChat((s) => s.rooms);
  const members = useChat((s) => s.members);
  const me = useChat((s) => s.me);

  const visible = useMemo(() => visibleRooms(rooms), [rooms]);
  const hidden = useMemo(() => hiddenRooms(rooms), [rooms]);
  const archived = useMemo(() => archivedRooms(rooms), [rooms]);
  const active = useMemo(
    () =>
      Object.values(members)
        .filter((m) => m.active)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-PT')),
    [members],
  );
  const people = active.filter((m) => !m.isBot);
  const mascots = active.filter((m) => m.isBot);
  const online = people.filter((m) => m.online);
  const offline = people.filter((m) => !m.online);

  return (
    <nav className={styles.sidebar} aria-label={t('sidebar.rooms')}>
      <div className={styles.scroll}>
        <div className={styles.section}>
          <h2 className={styles.label}>{t('sidebar.rooms')}</h2>
          <ul className={styles.list}>
            {visible.map((room) => (
              <RoomRow key={room.id} room={room} />
            ))}
          </ul>
          <button type="button" className={styles.newRoom} onClick={() => onOpen('newRoom')}>
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            {t('sidebar.newRoom')}
          </button>
        </div>

        {hidden.length > 0 && (
          <details className={styles.section}>
            <summary className={styles.label}>{t('sidebar.hidden')}</summary>
            <ul className={styles.list}>
              {hidden.map((room) => (
                <RoomRow key={room.id} room={room} />
              ))}
            </ul>
          </details>
        )}
        {archived.length > 0 && (
          <details className={styles.section}>
            <summary className={styles.label}>{t('sidebar.archived')}</summary>
            <ul className={styles.list}>
              {archived.map((room) => (
                <RoomRow key={room.id} room={room} />
              ))}
            </ul>
          </details>
        )}

        <div className={styles.section}>
          <h2 className={`${styles.label} num`}>{t('sidebar.online', { count: online.length })}</h2>
          <ul className={styles.members}>
            {online.map((m) => (
              <MemberRow key={m.id} member={m} isMe={m.id === me.id} />
            ))}
          </ul>
          {offline.length > 0 && (
            <details>
              <summary className={`${styles.label} num`}>
                {t('sidebar.everyone', { count: people.length })}
              </summary>
              <ul className={styles.members}>
                {offline.map((m) => (
                  <MemberRow key={m.id} member={m} isMe={m.id === me.id} />
                ))}
              </ul>
            </details>
          )}
        </div>

        {mascots.length > 0 && (
          <details className={styles.section} open>
            <summary className={styles.label}>{t('mascots.label')}</summary>
            <ul className={styles.members}>
              {mascots.map((m) => {
                const key = mascotByUserId(m.id)?.key;
                return (
                  <li key={m.id} className={styles.member} data-online>
                    {key && <Mascot mascot={key} size={20} />}
                    <span className={styles.memberName}>{m.displayName}</span>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </div>
      <MeFooter onOpen={onOpen} />
    </nav>
  );
}

function RoomRow({ room }: { room: RoomView }) {
  const isActive = useChat((s) => s.activeRoomId === room.id);
  const label = [
    room.name,
    room.unread > 0 ? t('sidebar.unread', { count: room.unread }) : '',
    room.mentions > 0 ? t('sidebar.mentions', { count: room.mentions }) : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <li>
      <button
        type="button"
        className={styles.room}
        data-active={isActive || undefined}
        data-unread={room.unread > 0 || undefined}
        aria-current={isActive ? 'page' : undefined}
        aria-label={label}
        onClick={() => getStore().selectRoom(room.id)}
      >
        <span className={styles.roomIcon} aria-hidden="true">
          {room.emoji ?? '#'}
        </span>
        <span className={styles.roomName}>{room.name}</span>
        {room.mentions > 0 && (
          <span className={styles.mention} aria-hidden="true">
            @
          </span>
        )}
        {room.unread > 0 && (
          <span className={`${styles.badge} num`} aria-hidden="true">
            {room.unread > 99 ? '99+' : room.unread}
          </span>
        )}
      </button>
    </li>
  );
}

function MemberRow({ member, isMe }: { member: Member; isMe: boolean }) {
  return (
    <li className={styles.member} data-online={member.online || undefined}>
      <span className={styles.presence} aria-hidden="true" />
      <span className={styles.memberName}>{member.displayName}</span>
      {isMe && <span className={styles.meTag}>{t('sidebar.you')}</span>}
    </li>
  );
}

function MeFooter({ onOpen }: { onOpen: (d: DialogName) => void }) {
  const me = useChat((s) => s.me);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isStaff = me.role === 'host' || me.role === 'admin';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className={styles.me} ref={ref}>
      <div className={styles.meText}>
        <span className={styles.meName}>{me.displayName}</span>
        <span className={styles.meRole}>{t(`roles.${me.role}`)}</span>
      </div>
      <button
        type="button"
        className={styles.menuButton}
        aria-label={t('sidebar.menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <EllipsisVertical size={18} strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {isStaff && (
            <button type="button" role="menuitem" onClick={pick(() => onOpen('admin'))}>
              {t('sidebar.admin')}
            </button>
          )}
          <button type="button" role="menuitem" onClick={pick(() => onOpen('rules'))}>
            {t('sidebar.rules')}
          </button>
          <button type="button" role="menuitem" onClick={pick(() => void getStore().logout())}>
            {t('sidebar.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
