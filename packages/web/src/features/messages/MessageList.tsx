import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { type Attachment, GROUPING_WINDOW_MS, type Message } from '@pausa/shared';
import { t } from '../../i18n';
import { dayKey, formatDay } from '../../lib/format';
import { getStore, type PendingMessage, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import { Dialog } from '../../ui/Dialog';
import { EmptyRoom } from '../mascots/EmptyRoom';
import { Lightbox } from './Lightbox';
import { MessageItem, PendingItem } from './MessageItem';
import styles from './MessageList.module.css';

type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'msg'; key: string; message: Message; grouped: boolean }
  | { kind: 'pending'; key: string; pending: PendingMessage };

/** Large base so prepending older pages can lower firstItemIndex without going negative. */
const BASE_INDEX = 1_000_000;
const NO_PENDING: PendingMessage[] = [];

function buildRows(messages: Message[], pending: PendingMessage[]): Row[] {
  const rows: Row[] = [];
  let prev: Message | undefined;
  let lastDay = '';
  const labels = { today: t('room.today'), yesterday: t('room.yesterday') };
  for (const m of messages) {
    const day = dayKey(m.createdAt);
    if (day !== lastDay) {
      rows.push({ kind: 'day', key: `day-${day}`, label: formatDay(m.createdAt, labels) });
      lastDay = day;
      prev = undefined;
    }
    const grouped =
      !!prev &&
      prev.userId === m.userId &&
      !prev.deletedAt &&
      !m.replyTo &&
      m.createdAt - prev.createdAt < GROUPING_WINDOW_MS;
    rows.push({ kind: 'msg', key: m.id, message: m, grouped });
    prev = m;
  }
  for (const p of pending) rows.push({ kind: 'pending', key: `pending-${p.clientId}`, pending: p });
  return rows;
}

export function MessageList({ roomId }: { roomId: string }) {
  const timeline = useChat((s) => s.timelines[roomId]);
  const allPending = useChat((s) => s.pending);
  const highlightId = useChat((s) => s.highlightId);
  const roomName = useChat((s) => s.rooms[roomId]?.name ?? '');
  const pending = useMemo(() => {
    const mine = allPending.filter((p) => p.roomId === roomId);
    return mine.length ? mine : NO_PENDING;
  }, [allPending, roomId]);

  const messages = timeline?.messages;
  const rows = useMemo(() => buildRows(messages ?? [], pending), [messages, pending]);
  const virtuoso = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [toDelete, setToDelete] = useState<Message | null>(null);
  const [lightbox, setLightbox] = useState<{ attachment: Attachment; authorId: string } | null>(
    null,
  );

  // Keep the viewport still when older rows are prepended: lower firstItemIndex by the number added on top.
  const [firstItemIndex, setFirstItemIndex] = useState(BASE_INDEX);
  const prevFirstKey = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const oldFirst = prevFirstKey.current;
    if (oldFirst && rows[0]?.key !== oldFirst) {
      const shift = rows.findIndex((r) => r.key === oldFirst);
      if (shift > 0) setFirstItemIndex((i) => i - shift);
    }
    prevFirstKey.current = rows[0]?.key;
  }, [rows]);

  // My own new message always scrolls to the bottom, wherever I was.
  const pendingCount = pending.length;
  const lastPendingCount = useRef(pendingCount);
  useEffect(() => {
    if (pendingCount > lastPendingCount.current) {
      virtuoso.current?.scrollToIndex({ index: 'LAST', behavior: 'auto' });
    }
    lastPendingCount.current = pendingCount;
  }, [pendingCount]);

  // Jump to a message revealed from a reply quote.
  useEffect(() => {
    if (!highlightId) return;
    const index = rows.findIndex((r) => r.key === highlightId);
    if (index >= 0) virtuoso.current?.scrollToIndex({ index, align: 'center', behavior: 'smooth' });
  }, [highlightId, rows]);

  const onAtBottom = useCallback(
    (bottom: boolean) => {
      setAtBottom(bottom);
      getStore().setAtBottom(roomId, bottom);
    },
    [roomId],
  );

  if (!timeline?.loaded) return <div className={styles.list} aria-busy="true" />;

  if (rows.length === 0) {
    return (
      <div className={styles.list}>
        <EmptyRoom roomId={roomId} />
      </div>
    );
  }

  return (
    <div className={styles.list}>
      <Virtuoso
        ref={virtuoso}
        className={styles.scroller}
        data={rows}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={rows.length - 1}
        computeItemKey={(_i, row) => row.key}
        followOutput={(bottom) => (bottom ? 'auto' : false)}
        atBottomThreshold={96}
        atBottomStateChange={onAtBottom}
        startReached={() => void getStore().loadOlder(roomId)}
        increaseViewportBy={{ top: 600, bottom: 200 }}
        components={{
          Header: () =>
            timeline.loadingOlder ? (
              <p className={styles.edge}>{t('room.loadingOlder')}</p>
            ) : !timeline.hasMore ? (
              <p className={styles.edge}>{t('room.start', { name: roomName })}</p>
            ) : (
              <div className={styles.edgeSpacer} />
            ),
          Footer: () => <div className={styles.footerSpacer} />,
        }}
        itemContent={(_index, row) => {
          if (row.kind === 'day') {
            return (
              <div className={styles.day} role="separator">
                <span>{row.label}</span>
              </div>
            );
          }
          if (row.kind === 'pending') return <PendingItem pending={row.pending} />;
          return (
            <MessageItem
              message={row.message}
              grouped={row.grouped}
              highlighted={row.message.id === highlightId}
              onDelete={setToDelete}
              onOpenImage={(attachment) =>
                setLightbox({ attachment, authorId: row.message.userId })
              }
            />
          );
        }}
      />

      {!atBottom && (
        <button
          type="button"
          className={styles.jump}
          onClick={() => virtuoso.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' })}
        >
          <ArrowDown size={16} strokeWidth={1.75} aria-hidden />
          {t('room.jumpToLatest')}
        </button>
      )}

      <Dialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={t('message.deleteTitle')}
        closeLabel={t('message.cancel')}
        size="sm"
        footer={
          <>
            <button type="button" className={buttons.secondary} onClick={() => setToDelete(null)}>
              {t('message.cancel')}
            </button>
            <button
              type="button"
              className={buttons.danger}
              onClick={() => {
                if (toDelete) void getStore().remove(toDelete.id);
                setToDelete(null);
              }}
            >
              {t('message.deleteConfirm')}
            </button>
          </>
        }
      >
        <p>{t('message.deleteBody')}</p>
      </Dialog>

      {lightbox && (
        <Lightbox
          attachment={lightbox.attachment}
          authorId={lightbox.authorId}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
