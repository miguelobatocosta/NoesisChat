import { useEffect, useMemo, useState } from 'react';
import type { RoomView as RoomViewType, SessionUser } from '@pausa/shared';
import { AdminPanel } from '../features/admin/AdminPanel';
import { RoomView } from '../features/messages/RoomView';
import { NoAccess } from '../features/onboarding/NoAccess';
import { NewRoomDialog } from '../features/rooms/NewRoomDialog';
import { QuickSwitcher } from '../features/rooms/QuickSwitcher';
import { RoomSettingsDialog } from '../features/rooms/RoomSettingsDialog';
import { Sidebar } from '../features/rooms/Sidebar';
import { visibleRooms } from '../features/rooms/roomOrder';
import { RulesDialog } from '../features/settings/RulesDialog';
import { ChatStore, getStore, setStore, useChat } from '../state/store';
import { BrandHeader } from '../ui/BrandHeader';
import { ConnectionPill } from '../ui/ConnectionPill';
import { Toast } from '../ui/Toast';
import styles from './ChatApp.module.css';

export type DialogName = 'newRoom' | 'roomSettings' | 'admin' | 'rules' | 'switcher' | null;

function pathFor(room: RoomViewType): string {
  return room.isMain ? '/' : `/r/${room.slug}`;
}

function slugFromPath(): string | undefined {
  const match = /^\/r\/([a-z0-9-]+)\/?$/.exec(window.location.pathname);
  return match?.[1];
}

export function ChatApp({ me }: { me: SessionUser }) {
  // One store per signed-in session. setStore is an idempotent assignment so children can read it.
  const store = useMemo(
    () =>
      new ChatStore(
        me,
        (room) => {
          if (window.location.pathname !== pathFor(room))
            window.history.pushState(null, '', pathFor(room));
        },
        slugFromPath(),
      ),
    [me],
  );
  setStore(store);

  useEffect(() => {
    store.start();
    const onPop = () => {
      const slug = slugFromPath();
      const rooms = Object.values(store.getState().rooms);
      const room = rooms.find((r) => (slug ? r.slug === slug : r.isMain));
      if (room) store.selectRoom(room.id, { replaceUrl: true });
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      store.stop();
    };
  }, [store]);

  return <ChatLayout />;
}

function ChatLayout() {
  const revoked = useChat((s) => s.revoked);
  const activeRoomId = useChat((s) => s.activeRoomId);
  const hasRooms = useChat((s) => Object.keys(s.rooms).length > 0);
  const [dialog, setDialog] = useState<DialogName>(null);
  // Phone layout: the sidebar is a drawer, opened for the current room, so picking another room
  // closes it by itself. Esc and tapping outside close it too.
  const [drawerFor, setDrawerFor] = useState<string | null>(null);
  const drawer = drawerFor === activeRoomId;
  const setDrawer = (open: boolean) => setDrawerFor(open ? activeRoomId : null);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerFor(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setDialog('switcher');
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const store = getStore();
        const { rooms, activeRoomId: current } = store.getState();
        const list = visibleRooms(rooms);
        const i = list.findIndex((r) => r.id === current);
        const next = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
        if (next) store.selectRoom(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (revoked) {
    return (
      <div className={styles.app}>
        <BrandHeader />
        <main className={styles.center}>
          <NoAccess revoked />
        </main>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <BrandHeader>
        <ConnectionPill />
      </BrandHeader>
      <div className={styles.body}>
        <Sidebar
          onOpen={(d) => {
            setDrawer(false);
            setDialog(d);
          }}
          drawerOpen={drawer}
        />
        <div
          className={styles.scrim}
          data-open={drawer || undefined}
          onClick={() => setDrawer(false)}
          aria-hidden="true"
        />
        {hasRooms && (
          <RoomView
            key={activeRoomId}
            roomId={activeRoomId}
            onOpenSettings={() => setDialog('roomSettings')}
            onOpenRooms={() => setDrawer(true)}
          />
        )}
      </div>
      <NewRoomDialog open={dialog === 'newRoom'} onClose={() => setDialog(null)} />
      {dialog === 'roomSettings' && (
        <RoomSettingsDialog roomId={activeRoomId} onClose={() => setDialog(null)} />
      )}
      {dialog === 'admin' && <AdminPanel onClose={() => setDialog(null)} />}
      <RulesDialog open={dialog === 'rules'} onClose={() => setDialog(null)} />
      {dialog === 'switcher' && <QuickSwitcher onClose={() => setDialog(null)} />}
      <Toast />
    </div>
  );
}
