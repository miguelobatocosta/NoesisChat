import { z } from 'zod';
import { LIMITS, MASCOT_KEYS } from './constants';
import { isEmoji, ULID_RE } from './text';
import type {
  AdminLogEntry,
  InviteView,
  Member,
  Message,
  NotifyLevel,
  Room,
  RoomView,
  SessionUser,
} from './types';

// --- building blocks -----------------------------------------------------------------------------

export const Id = z.string().regex(ULID_RE, 'invalid id');
export const ClientId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'invalid client id');
export const Emoji = z.string().refine(isEmoji, 'invalid emoji');
export const NotifyLevelSchema = z.enum(['all', 'mentions', 'none']);
export const RoomName = z.string().trim().min(1).max(LIMITS.roomName);
export const RoomDescription = z.string().trim().max(LIMITS.roomDescription);
export const DisplayName = z.string().trim().min(2).max(LIMITS.displayName);
export const MessageBody = z.string().max(LIMITS.messageLength);
/** 128-bit invite code, base64url without padding (22 chars). */
export const InviteCode = z.string().regex(/^[A-Za-z0-9_-]{22}$/, 'invalid invite code');

// --- client → server events (all acknowledged) -----------------------------------------------------

export const ClientEventSchemas = {
  'rooms:list': z.object({}),
  'rooms:create': z.object({
    name: RoomName,
    emoji: Emoji.nullish(),
    description: RoomDescription.nullish(),
  }),
  'rooms:update': z.object({
    roomId: Id,
    name: RoomName.optional(),
    emoji: Emoji.nullable().optional(),
    description: RoomDescription.nullable().optional(),
    mascotKey: z.enum(MASCOT_KEYS).optional(),
    mascotEnabled: z.boolean().optional(),
  }),
  'rooms:archive': z.object({ roomId: Id, archived: z.boolean() }),
  'messages:history': z.object({
    roomId: Id,
    before: Id.optional(),
    limit: z.number().int().min(1).max(LIMITS.historyPage).optional(),
  }),
  'messages:sync': z.object({ roomId: Id, sinceSeq: z.number().int().min(0) }),
  'messages:send': z.object({
    roomId: Id,
    clientId: ClientId,
    body: MessageBody,
    replyToId: Id.optional(),
    attachmentIds: z.array(Id).max(LIMITS.attachmentsPerMessage).default([]),
  }),
  'messages:edit': z.object({ messageId: Id, body: MessageBody }),
  'messages:delete': z.object({ messageId: Id }),
  'reactions:toggle': z.object({ messageId: Id, emoji: Emoji }),
  typing: z.object({ roomId: Id }),
  'read:mark': z.object({ roomId: Id, messageId: Id }),
  'prefs:update': z.object({
    roomId: Id,
    notify: NotifyLevelSchema.optional(),
    hidden: z.boolean().optional(),
  }),
  'members:list': z.object({}),
  'admin:invites:create': z.object({
    intendedName: DisplayName.optional(),
    expiresIn: z.enum(['24h', '7d']),
  }),
  'admin:invites:list': z.object({}),
  'admin:invites:revoke': z.object({ inviteId: Id }),
  'admin:members:revoke': z.object({ userId: Id }),
  'admin:members:setRole': z.object({ userId: Id, role: z.enum(['admin', 'member']) }),
  'admin:log:list': z.object({ before: Id.optional() }),
} as const;

export type ClientEventName = keyof typeof ClientEventSchemas;
export type ClientEventInput<K extends ClientEventName> = z.input<(typeof ClientEventSchemas)[K]>;
export type ClientEventPayload<K extends ClientEventName> = z.output<
  (typeof ClientEventSchemas)[K]
>;

export interface ClientEventResults {
  'rooms:list': { rooms: RoomView[] };
  'rooms:create': { room: RoomView };
  'rooms:update': { room: Room };
  'rooms:archive': { room: Room };
  'messages:history': { messages: Message[]; hasMore: boolean };
  'messages:sync': { messages: Message[]; latestSeq: number; truncated: boolean };
  'messages:send': { message: Message };
  'messages:edit': { message: Message };
  'messages:delete': { message: Message };
  'reactions:toggle': { message: Message };
  typing: Record<string, never>;
  'read:mark': { roomId: string; lastReadId: string };
  'prefs:update': { roomId: string; notify: NotifyLevel; hidden: boolean };
  'members:list': { members: Member[] };
  'admin:invites:create': { invite: InviteView; link: string };
  'admin:invites:list': { invites: InviteView[] };
  'admin:invites:revoke': { invite: InviteView };
  'admin:members:revoke': { member: Member };
  'admin:members:setRole': { member: Member };
  'admin:log:list': { entries: AdminLogEntry[]; hasMore: boolean };
}

export const ERROR_CODES = [
  'VALIDATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'ROOM_EXISTS',
  'ROOM_ARCHIVED',
  'MAIN_ROOM_PROTECTED',
  'NAME_TAKEN',
  'INVITE_INVALID',
  'EMPTY_MESSAGE',
  'BAD_ORIGIN',
  'UPLOAD_TOO_LARGE',
  'UPLOAD_TYPE',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type AckError = { code: ErrorCode; message: string };
export type Ack<T> = { ok: true; data: T } | { ok: false; error: AckError };

export type ClientToServerEvents = {
  [K in ClientEventName]: (
    payload: ClientEventInput<K>,
    ack: (res: Ack<ClientEventResults[K]>) => void,
  ) => void;
};

// --- server → client events ----------------------------------------------------------------------

export interface ServerToClientEvents {
  'message:new': (p: { message: Message }) => void;
  /** Edits, deletes and reaction changes: always the full message with its new seq. */
  'message:updated': (p: { message: Message }) => void;
  'room:created': (p: { room: Room }) => void;
  'room:updated': (p: { room: Room }) => void;
  presence: (p: { userId: string; online: boolean }) => void;
  typing: (p: { roomId: string; userId: string }) => void;
  'member:updated': (p: { member: Member }) => void;
  'session:revoked': () => void;
  'server:shutdown': () => void;
}

// --- HTTP ----------------------------------------------------------------------------------------

export const JoinRequest = z.object({ code: InviteCode, displayName: DisplayName.optional() });
export type JoinRequest = z.infer<typeof JoinRequest>;

export interface SessionResponse {
  ok: true;
  user: SessionUser;
}

/** GET /api/session: 200 either way, so a signed-out visit doesn't log a console error. */
export interface SessionState {
  ok: true;
  user: SessionUser | null;
}
