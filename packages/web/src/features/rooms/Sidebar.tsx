import { useEffect, useMemo, useRef, useState } from 'react';
import { EllipsisVertical, Plus } from 'lucide-react';
import { type Member, mascotByUserId, type RoomView } from '@pausa/shared';
import type { DialogName } from '../../app/ChatApp';
import { t } from '../../i18n';
import { getStore, type Page, useChat } from '../../state/store';
import { formatTime } from '../../lib/format';
import { quietUntil, useDnd } from '../../lib/dnd';
import { THEME_PREFERENCES, useTheme } from '../../theme';
import { Mascot } from '../mascots/Mascot';
import { archivedRooms, hiddenRooms, visibleRooms } from './roomOrder';
import styles from './Sidebar.module.css';

export function Sidebar({
  onOpen,
  drawerOpen = false,
}: {
  onOpen: (d: DialogName) => void;
  /** Phone layout only: whether the drawer is pulled out. */
  drawerOpen?: boolean;
}) {
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
  // You're in the footer already, so Online lists the others.
  const online = people.filter((m) => m.online && m.id !== me.id);
  const offline = people.filter((m) => !m.online);

  return (
    <nav
      className={styles.sidebar}
      aria-label={t('sidebar.rooms')}
      data-open={drawerOpen || undefined}
    >
      <div className={styles.scroll}>
        <ul className={`${styles.list} ${styles.pages}`}>
          <PageRow page="cakes" icon="🎂" />
          <PageRow page="office" icon="🏢" />
        </ul>
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
              <MemberRow key={m.id} member={m} />
            ))}
          </ul>
          {offline.length > 0 && (
            <details>
              <summary className={`${styles.label} num`}>
                {t('sidebar.everyone', { count: people.length })}
              </summary>
              <ul className={styles.members}>
                {offline.map((m) => (
                  <MemberRow key={m.id} member={m} />
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

/** Bolos / Escritório (D-53/D-54): pages, not rooms. The number is cakes owed in total. */
function PageRow({ page, icon }: { page: Exclude<Page, 'room'>; icon: string }) {
  const isActive = useChat((s) => s.page === page);
  const owed = useChat((s) =>
    page === 'cakes' ? (s.community?.debts.filter((d) => d.status === 'owed').length ?? 0) : 0,
  );
  const name = t(`pages.${page}`);
  return (
    <li>
      <button
        type="button"
        className={styles.room}
        data-active={isActive || undefined}
        aria-current={isActive ? 'page' : undefined}
        aria-label={owed > 0 ? `${name}, ${t('pages.owed', { count: owed })}` : name}
        onClick={() => getStore().openPage(page)}
      >
        <span className={styles.roomIcon} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.roomName}>{name}</span>
        {owed > 0 && (
          <span className={`${styles.pageCount} num`} aria-hidden="true">
            {owed}
          </span>
        )}
      </button>
    </li>
  );
}

function RoomRow({ room }: { room: RoomView }) {
  const isActive = useChat((s) => s.page === 'room' && s.activeRoomId === room.id);
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

function MemberRow({ member }: { member: Member }) {
  return (
    <li className={styles.member} data-online={member.online || undefined}>
      <span className={styles.presence} aria-hidden="true" />
      <span className={styles.memberName}>{member.displayName}</span>
    </li>
  );
}

function MeFooter({ onOpen }: { onOpen: (d: DialogName) => void }) {
  const me = useChat((s) => s.me);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
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
        <QuietNote />
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
          <button type="button" role="menuitem" onClick={pick(() => onOpen('dnd'))}>
            {t('dnd.title')}
          </button>
          <button type="button" role="menuitem" onClick={pick(() => onOpen('rules'))}>
            {t('sidebar.rules')}
          </button>
          <div className={styles.menuGroup} role="group" aria-label={t('theme.label')}>
            <span className={styles.menuLabel} aria-hidden="true">
              {t('theme.label')}
            </span>
            <div className={styles.menuSegments}>
              {THEME_PREFERENCES.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={theme === option}
                  onClick={() => setTheme(option)}
                >
                  {t(`theme.${option}`)}
                </button>
              ))}
            </div>
          </div>
          <button type="button" role="menuitem" onClick={pick(() => void getStore().logout())}>
            {t('sidebar.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

/** "Em silêncio até 14:00" while do not disturb is on (re-checked every minute). */
function QuietNote() {
  const dnd = useDnd();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const until = quietUntil(dnd, now);
  if (until === null) return null;
  return <span className={styles.quiet}>{t('dnd.active', { time: formatTime(until) })}</span>;
}
