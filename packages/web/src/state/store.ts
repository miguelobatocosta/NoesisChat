import { useSyncExternalStore } from 'react';
import {
  APP_NAME,
  type Attachment,
  type ClientEventInput,
  type ClientEventName,
  type ClientEventResults,
  MAIN_ROOM_ID,
  type Member,
  type Message,
  type NotifyLevel,
  type Room,
  type RoomView,
  type SessionUser,
  type Standing,
} from '@pausa/shared';
import { type ClientErrorCode, errorCode, RequestError } from '../api/errors';
import { logout as httpLogout } from '../api/http';
import { createSocket, type PausaSocket, request } from '../api/socket';
import { t } from '../i18n';
import { isQuiet, loadDnd } from '../lib/dnd';
import { newClientId } from '../lib/ids';
import { askPermissionOnce, setBadge, shouldNotify, showNotification } from '../lib/notify';
import { plainText } from '../lib/plaintext';

type Connection = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface Timeline {
  messages: Message[];
  hasMore: boolean;
  loaded: boolean;
  loadingOlder: boolean;
}

export interface PendingMessage {
  clientId: string;
  roomId: string;
  body: string;
  replyTo: Message | null;
  attachments: Attachment[];
  createdAt: number;
  status: 'sending' | 'failed';
  error?: ClientErrorCode;
}

export interface ChatState {
  me: SessionUser;
  connection: Connection;
  shutdown: boolean;
  revoked: boolean;
  rooms: Record<string, RoomView>;
  activeRoomId: string;
  timelines: Record<string, Timeline>;
  pending: PendingMessage[];
  members: Record<string, Member>;
  /** Labels and mutes per room, then per user (D-51). Only people with either are listed. */
  standings: Record<string, Record<string, Standing>>;
  typing: Record<string, Record<string, number>>;
  replyTo: Record<string, Message | null>;
  editingId: string | null;
  highlightId: string | null;
  focused: boolean;
  toast: { id: number; code: ClientErrorCode } | null;
}

const EMPTY_TIMELINE: Timeline = {
  messages: [],
  hasMore: true,
  loaded: false,
  loadingOlder: false,
};
const TRANSIENT: ClientErrorCode[] = ['OFFLINE', 'TIMEOUT', 'RATE_LIMITED', 'INTERNAL'];

/** Inserts or replaces by id, keeping the list sorted by id (ULIDs sort by time). */
function upsertSorted(list: Message[], message: Message): Message[] {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.id < message.id) lo = mid + 1;
    else hi = mid;
  }
  const next = list.slice();
  if (list[lo]?.id === message.id) {
    if (list[lo]!.seq > message.seq) return list; // never go back to an older version
    next[lo] = message;
  } else next.splice(lo, 0, message);
  return next;
}

function roomFromShared(room: Room, existing?: RoomView): RoomView {
  return {
    unread: 0,
    mentions: 0,
    notify: 'mentions',
    hidden: false,
    lastReadId: null,
    ...existing,
    ...room,
  };
}

/**
 * All client state and every server interaction. Components read slices with useChat(selector)
 * and call methods; nothing else talks to the socket.
 */
export class ChatStore {
  private state: ChatState;
  private listeners = new Set<() => void>();
  private maxSeq = new Map<string, number>();
  private atBottom = new Map<string, boolean>();
  private everConnected = false;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private typingTimer: ReturnType<typeof setInterval> | undefined;
  private lastTypingSent = 0;
  private cleanups: (() => void)[] = [];
  readonly socket: PausaSocket;

  constructor(
    me: SessionUser,
    private readonly navigate: (room: RoomView) => void,
    initialRoomSlug?: string,
  ) {
    this.socket = createSocket();
    this.state = {
      me,
      connection: 'connecting',
      shutdown: false,
      revoked: false,
      rooms: {},
      activeRoomId: MAIN_ROOM_ID,
      timelines: {},
      pending: [],
      members: {},
      standings: {},
      typing: {},
      replyTo: {},
      editingId: null,
      highlightId: null,
      focused: typeof document !== 'undefined' ? document.hasFocus() : true,
      toast: null,
    };
    this.initialSlug = initialRoomSlug;
  }

  private initialSlug: string | undefined;

  getState = (): ChatState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)): void {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  private req<K extends ClientEventName>(
    name: K,
    payload: ClientEventInput<K>,
  ): Promise<ClientEventResults[K]> {
    return request(this.socket, name, payload);
  }

  // --- lifecycle -----------------------------------------------------------------------------------

  start(): void {
    const s = this.socket;
    s.on('connect', () => void this.onConnect());
    s.on('disconnect', (reason) => {
      if (this.state.revoked) return;
      this.set({ connection: 'reconnecting' });
      // A server-initiated disconnect (shutdown) is not retried by Socket.IO itself.
      if (reason === 'io server disconnect')
        setTimeout(() => !this.state.revoked && s.connect(), 2000);
    });
    s.on('connect_error', (err) => {
      if (err.message === 'UNAUTHORIZED') {
        this.set({ revoked: true });
        s.disconnect();
        return;
      }
      this.set({ connection: this.everConnected ? 'offline' : 'connecting' });
      // Socket.IO only retries automatically after a dropped connection, not a refused first one.
      if (!s.active) setTimeout(() => !this.state.revoked && s.connect(), 3000);
    });
    s.io.on('reconnect_error', () => this.set({ connection: 'offline' }));

    s.on('message:new', ({ message }) => this.onNewMessage(message));
    s.on('message:updated', ({ message }) => this.applyMessage(message));
    s.on('room:created', ({ room }) =>
      this.set((st) => ({ rooms: { ...st.rooms, [room.id]: roomFromShared(room) } })),
    );
    s.on('room:updated', ({ room }) =>
      this.set((st) => ({
        rooms: { ...st.rooms, [room.id]: roomFromShared(room, st.rooms[room.id]) },
      })),
    );
    s.on('presence', ({ userId, online }) =>
      this.set((st) => {
        const m = st.members[userId];
        return m ? { members: { ...st.members, [userId]: { ...m, online } } } : {};
      }),
    );
    s.on('member:updated', ({ member }) => {
      this.set((st) => ({ members: { ...st.members, [member.id]: member } }));
      if (member.id === this.state.me.id) {
        if (!member.active) this.set({ revoked: true });
        else
          this.set((st) => ({
            me: { ...st.me, role: member.role, displayName: member.displayName },
          }));
      }
    });
    s.on('moderation:updated', ({ standing }) => this.applyStanding(standing));
    s.on('typing', ({ roomId, userId }) => {
      if (userId === this.state.me.id) return;
      this.set((st) => ({
        typing: { ...st.typing, [roomId]: { ...st.typing[roomId], [userId]: Date.now() + 4000 } },
      }));
    });
    s.on('session:revoked', () => {
      this.set({ revoked: true });
      s.disconnect();
    });
    s.on('server:shutdown', () => this.set({ shutdown: true, connection: 'offline' }));

    const onFocus = () => {
      this.set({ focused: true });
      this.markActiveReadIfVisible();
    };
    const onBlur = () => this.set({ focused: false });
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    this.cleanups.push(() => window.removeEventListener('focus', onFocus));
    this.cleanups.push(() => window.removeEventListener('blur', onBlur));

    this.typingTimer = setInterval(() => this.pruneTyping(), 1000);
    s.connect();
  }

  stop(): void {
    this.socket.removeAllListeners();
    this.socket.disconnect();
    clearInterval(this.typingTimer);
    for (const c of this.cleanups) c();
  }

  private async onConnect(): Promise<void> {
    const first = !this.everConnected;
    this.everConnected = true;
    this.set({ connection: 'connected', shutdown: false });
    try {
      const [{ rooms }, { members }] = await Promise.all([
        this.req('rooms:list', {}),
        this.req('members:list', {}),
      ]);
      this.set({
        rooms: Object.fromEntries(rooms.map((r) => [r.id, r])),
        members: Object.fromEntries(members.map((m) => [m.id, m])),
      });
      if (first) {
        const initial =
          rooms.find((r) => r.slug === this.initialSlug) ?? rooms.find((r) => r.isMain) ?? rooms[0];
        if (initial) this.selectRoom(initial.id, { replaceUrl: true });
      } else {
        // Catch up on everything that changed while we were away (D-33).
        await Promise.all(
          Object.entries(this.state.timelines)
            .filter(([, tl]) => tl.loaded)
            .flatMap(([roomId]) => [this.syncRoom(roomId), this.loadStandings(roomId)]),
        );
      }
      this.updateBadge();
      await this.flushPending();
    } catch (err) {
      this.fail(err);
    }
  }

  // --- rooms -----------------------------------------------------------------------------------------

  selectRoom(roomId: string, opts: { replaceUrl?: boolean } = {}): void {
    const room = this.state.rooms[roomId];
    if (!room) return;
    this.set({ activeRoomId: roomId, editingId: null });
    if (!opts.replaceUrl) this.navigate(room);
    if (!this.state.timelines[roomId]?.loaded) void this.loadLatest(roomId);
    void this.loadStandings(roomId);
  }

  // --- topic moderation (D-51) -------------------------------------------------------------------------

  private async loadStandings(roomId: string): Promise<void> {
    try {
      const { standings } = await this.req('moderation:standings', { roomId });
      this.set((st) => ({
        standings: {
          ...st.standings,
          [roomId]: Object.fromEntries(standings.map((x) => [x.userId, x])),
        },
      }));
    } catch {
      /* labels are decoration; the next room switch or reconnect retries */
    }
  }

  private applyStanding(standing: Standing): void {
    this.set((st) => {
      const room = { ...st.standings[standing.roomId] };
      if (standing.labels.length === 0 && standing.mutedUntil === null)
        delete room[standing.userId];
      else room[standing.userId] = standing;
      return { standings: { ...st.standings, [standing.roomId]: room } };
    });
  }

  async createRoom(input: ClientEventInput<'rooms:create'>): Promise<void> {
    const { room } = await this.req('rooms:create', input);
    this.set((st) => ({ rooms: { ...st.rooms, [room.id]: room } }));
    this.selectRoom(room.id);
  }

  async updateRoom(input: ClientEventInput<'rooms:update'>): Promise<void> {
    const { room } = await this.req('rooms:update', input);
    this.set((st) => ({
      rooms: { ...st.rooms, [room.id]: roomFromShared(room, st.rooms[room.id]) },
    }));
  }

  async archiveRoom(roomId: string, archived: boolean): Promise<void> {
    const { room } = await this.req('rooms:archive', { roomId, archived });
    this.set((st) => ({
      rooms: { ...st.rooms, [room.id]: roomFromShared(room, st.rooms[room.id]) },
    }));
  }

  async updatePrefs(
    roomId: string,
    prefs: { notify?: NotifyLevel; hidden?: boolean },
  ): Promise<void> {
    const res = await this.req('prefs:update', { roomId, ...prefs });
    this.set((st) => {
      const room = st.rooms[roomId];
      return room
        ? { rooms: { ...st.rooms, [roomId]: { ...room, notify: res.notify, hidden: res.hidden } } }
        : {};
    });
  }

  // --- timelines -------------------------------------------------------------------------------------

  private setTimeline(roomId: string, fn: (tl: Timeline) => Timeline): void {
    this.set((st) => ({
      timelines: { ...st.timelines, [roomId]: fn(st.timelines[roomId] ?? EMPTY_TIMELINE) },
    }));
  }

  private trackSeq(message: Message): void {
    this.maxSeq.set(message.roomId, Math.max(this.maxSeq.get(message.roomId) ?? 0, message.seq));
  }

  async loadLatest(roomId: string): Promise<void> {
    try {
      const { messages, hasMore } = await this.req('messages:history', { roomId });
      messages.forEach((m) => this.trackSeq(m));
      this.setTimeline(roomId, () => ({ messages, hasMore, loaded: true, loadingOlder: false }));
    } catch (err) {
      this.showError(errorCode(err));
    }
  }

  async loadOlder(roomId: string): Promise<number> {
    const tl = this.state.timelines[roomId];
    if (!tl?.loaded || !tl.hasMore || tl.loadingOlder) return 0;
    const before = tl.messages[0]?.id;
    this.setTimeline(roomId, (cur) => ({ ...cur, loadingOlder: true }));
    try {
      const { messages, hasMore } = await this.req(
        'messages:history',
        before ? { roomId, before } : { roomId },
      );
      messages.forEach((m) => this.trackSeq(m));
      this.setTimeline(roomId, (cur) => ({
        ...cur,
        messages: messages.reduce(upsertSorted, cur.messages),
        hasMore,
        loadingOlder: false,
      }));
      return messages.length;
    } catch (err) {
      this.setTimeline(roomId, (cur) => ({ ...cur, loadingOlder: false }));
      this.showError(errorCode(err));
      return 0;
    }
  }

  private async syncRoom(roomId: string): Promise<void> {
    const res = await this.req('messages:sync', { roomId, sinceSeq: this.maxSeq.get(roomId) ?? 0 });
    if (res.truncated) {
      await this.loadLatest(roomId);
      return;
    }
    for (const m of res.messages) this.applyMessage(m);
    this.maxSeq.set(roomId, Math.max(this.maxSeq.get(roomId) ?? 0, res.latestSeq));
  }

  /** Puts a message into its loaded timeline (if it belongs in the loaded window) and clears its pending twin. */
  private applyMessage(message: Message): void {
    this.trackSeq(message);
    const tl = this.state.timelines[message.roomId];
    if (tl?.loaded) {
      const oldest = tl.messages[0]?.id;
      const inWindow = !tl.hasMore || !oldest || message.id >= oldest;
      if (inWindow)
        this.setTimeline(message.roomId, (cur) => ({
          ...cur,
          messages: upsertSorted(cur.messages, message),
        }));
    }
    if (message.userId === this.state.me.id) {
      this.set((st) => ({ pending: st.pending.filter((p) => p.clientId !== message.clientId) }));
    }
  }

  private onNewMessage(message: Message): void {
    this.applyMessage(message);
    // Whoever just sent a message has stopped typing.
    if (this.state.typing[message.roomId]?.[message.userId]) {
      this.set((s) => {
        const { [message.userId]: _gone, ...rest } = s.typing[message.roomId] ?? {};
        return { typing: { ...s.typing, [message.roomId]: rest } };
      });
    }
    const st = this.state;
    const room = st.rooms[message.roomId];
    if (!room) return;
    const isOwn = message.userId === st.me.id;
    const isMention = message.mentions.includes(st.me.id);
    const isReplyToMe = message.replyTo?.userId === st.me.id;
    const roomActive = st.activeRoomId === message.roomId;
    const visible = roomActive && st.focused && (this.atBottom.get(message.roomId) ?? true);

    if (!isOwn) {
      if (visible) this.markRead(message.roomId);
      else {
        this.set((s) => ({
          rooms: {
            ...s.rooms,
            [room.id]: {
              ...room,
              unread: room.unread + 1,
              mentions: room.mentions + (isMention ? 1 : 0),
            },
          },
        }));
      }
      this.updateBadge();
    }

    if (
      shouldNotify({
        level: room.notify,
        isMention,
        isReplyToMe,
        isOwn,
        roomActive,
        windowFocused: st.focused,
        quiet: isQuiet(loadDnd(), Date.now()),
      })
    ) {
      const author = this.nameOf(message.userId);
      const body = message.body
        ? plainText(message.body, (id) => this.nameOf(id), 120)
        : t('notifications.image');
      showNotification(
        t('notifications.title', { room: room.name, name: author }),
        body,
        room.id,
        () => this.selectRoom(room.id),
      );
    }
  }

  setAtBottom(roomId: string, atBottom: boolean): void {
    this.atBottom.set(roomId, atBottom);
    if (atBottom) this.markActiveReadIfVisible();
  }

  private markActiveReadIfVisible(): void {
    const { activeRoomId, focused } = this.state;
    if (focused && (this.atBottom.get(activeRoomId) ?? true)) this.markRead(activeRoomId);
  }

  markRead(roomId: string): void {
    const room = this.state.rooms[roomId];
    const last = this.state.timelines[roomId]?.messages.at(-1);
    if (!room || !last) return;
    if (room.unread === 0 && room.mentions === 0 && room.lastReadId && room.lastReadId >= last.id)
      return;
    this.set((st) => ({
      rooms: { ...st.rooms, [roomId]: { ...room, unread: 0, mentions: 0, lastReadId: last.id } },
    }));
    this.updateBadge();
    if (this.socket.connected)
      void this.req('read:mark', { roomId, messageId: last.id }).catch(() => undefined);
  }

  private updateBadge(): void {
    const total = Object.values(this.state.rooms)
      .filter((r) => !r.hidden && !r.archivedAt)
      .reduce((sum, r) => sum + r.unread, 0);
    setBadge(APP_NAME, total);
  }

  // --- sending ---------------------------------------------------------------------------------------

  send(roomId: string, body: string, attachments: Attachment[]): void {
    const replyTo = this.state.replyTo[roomId] ?? null;
    const pending: PendingMessage = {
      clientId: newClientId(),
      roomId,
      body,
      replyTo,
      attachments,
      createdAt: Date.now(),
      status: 'sending',
    };
    this.set((st) => ({
      pending: [...st.pending, pending],
      replyTo: { ...st.replyTo, [roomId]: null },
    }));
    if (this.socket.connected) void this.deliver(pending);
  }

  private async deliver(p: PendingMessage): Promise<void> {
    this.set((st) => ({
      pending: st.pending.map((x) =>
        x.clientId === p.clientId ? { ...x, status: 'sending' as const } : x,
      ),
    }));
    try {
      const payload: ClientEventInput<'messages:send'> = {
        roomId: p.roomId,
        clientId: p.clientId,
        body: p.body,
        attachmentIds: p.attachments.map((a) => a.id),
      };
      if (p.replyTo) payload.replyToId = p.replyTo.id;
      const { message } = await this.req('messages:send', payload);
      this.applyMessage(message);
      askPermissionOnce();
    } catch (err) {
      const code = errorCode(err);
      this.set((st) => ({
        pending: st.pending.map((x) =>
          x.clientId === p.clientId ? { ...x, status: 'failed' as const, error: code } : x,
        ),
      }));
    }
  }

  /** On (re)connect: queued and transiently-failed messages go out again, in order. Idempotent (D-38). */
  private async flushPending(): Promise<void> {
    for (const p of this.state.pending) {
      if (p.status === 'sending' || (p.error && TRANSIENT.includes(p.error))) await this.deliver(p);
    }
  }

  retry(clientId: string): void {
    const p = this.state.pending.find((x) => x.clientId === clientId);
    if (p && this.socket.connected) void this.deliver(p);
  }

  discard(clientId: string): void {
    this.set((st) => ({ pending: st.pending.filter((x) => x.clientId !== clientId) }));
  }

  async edit(messageId: string, body: string): Promise<void> {
    try {
      const { message } = await this.req('messages:edit', { messageId, body });
      this.applyMessage(message);
      this.set({ editingId: null });
    } catch (err) {
      this.showError(errorCode(err));
    }
  }

  async remove(messageId: string): Promise<void> {
    try {
      const { message } = await this.req('messages:delete', { messageId });
      this.applyMessage(message);
    } catch (err) {
      this.showError(errorCode(err));
    }
  }

  async react(messageId: string, emoji: string): Promise<void> {
    try {
      const { message } = await this.req('reactions:toggle', { messageId, emoji });
      this.applyMessage(message);
    } catch (err) {
      this.showError(errorCode(err));
    }
  }

  sendTyping(roomId: string): void {
    const now = Date.now();
    if (now - this.lastTypingSent < 2500 || !this.socket.connected) return;
    this.lastTypingSent = now;
    void this.req('typing', { roomId }).catch(() => undefined);
  }

  private pruneTyping(): void {
    const now = Date.now();
    let changed = false;
    const typing: ChatState['typing'] = {};
    for (const [roomId, users] of Object.entries(this.state.typing)) {
      const alive = Object.fromEntries(Object.entries(users).filter(([, exp]) => exp > now));
      if (Object.keys(alive).length !== Object.keys(users).length) changed = true;
      if (Object.keys(alive).length) typing[roomId] = alive;
    }
    if (changed) this.set({ typing });
  }

  setReplyTo(roomId: string, message: Message | null): void {
    this.set((st) => ({ replyTo: { ...st.replyTo, [roomId]: message }, editingId: null }));
  }

  setEditing(messageId: string | null): void {
    this.set({ editingId: messageId });
  }

  /** Scrolls to a message, loading older pages if needed (up to 10). Returns false if not found. */
  /** Opens a room and scrolls to (and highlights) a message there, loading history as needed. */
  async jumpTo(roomId: string, messageId: string): Promise<boolean> {
    this.selectRoom(roomId);
    if (!this.state.timelines[roomId]?.loaded) await this.loadLatest(roomId);
    return this.reveal(roomId, messageId);
  }

  async reveal(roomId: string, messageId: string): Promise<boolean> {
    for (let i = 0; i < 10; i++) {
      const tl = this.state.timelines[roomId];
      if (tl?.messages.some((m) => m.id === messageId)) {
        this.set({ highlightId: messageId });
        setTimeout(
          () => this.state.highlightId === messageId && this.set({ highlightId: null }),
          2000,
        );
        return true;
      }
      if (!tl?.hasMore) return false;
      if ((await this.loadOlder(roomId)) === 0) return false;
    }
    return false;
  }

  // --- admin -----------------------------------------------------------------------------------------

  admin<K extends ClientEventName>(
    name: K,
    payload: ClientEventInput<K>,
  ): Promise<ClientEventResults[K]> {
    return this.req(name, payload);
  }

  async logout(): Promise<void> {
    await httpLogout().catch(() => undefined);
    this.set({ revoked: true });
    this.socket.disconnect();
  }

  // --- misc ------------------------------------------------------------------------------------------

  nameOf(userId: string): string {
    return this.state.members[userId]?.displayName ?? t('message.formerMember');
  }

  /** Unexpected client-side exceptions are logged; expected server errors are just shown. */
  private fail(err: unknown): void {
    if (!(err instanceof RequestError)) console.error(err);
    this.showError(errorCode(err));
  }

  showError(code: ClientErrorCode): void {
    clearTimeout(this.toastTimer);
    this.set({ toast: { id: Date.now(), code } });
    this.toastTimer = setTimeout(() => this.set({ toast: null }), 4500);
  }

  dismissToast(): void {
    this.set({ toast: null });
  }
}

// --- React binding ---------------------------------------------------------------------------------

let current: ChatStore | null = null;

export function setStore(store: ChatStore | null): void {
  current = store;
}

export function getStore(): ChatStore {
  if (!current) throw new Error('ChatStore not initialised');
  return current;
}

/** Subscribes to a slice of state. Selectors must return stable references for unchanged data. */
export function useChat<T>(selector: (s: ChatState) => T): T {
  const store = getStore();
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}
