import type { MascotKey } from './constants';

/** Wire types sent by the server. Inputs from clients are validated with the zod schemas in events.ts. */

export type Role = 'host' | 'admin' | 'member';
export type NotifyLevel = 'all' | 'mentions' | 'none';

export interface SessionUser {
  id: string;
  displayName: string;
  role: Role;
}

export interface Member extends SessionUser {
  /** false once revoked. Kept in the list so old messages still show the author's name. */
  active: boolean;
  online: boolean;
  /** A room mascot (D-49): never online, can't be revoked or promoted. */
  isBot: boolean;
  joinedAt: number;
  lastSeenAt: number | null;
}

export interface Room {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
  description: string | null;
  isMain: boolean;
  /** The room's mascot (D-49) and whether it talks there. */
  mascotKey: MascotKey | null;
  mascotEnabled: boolean;
  createdBy: string | null;
  createdAt: number;
  archivedAt: number | null;
}

/** A room plus my personal state in it. */
export interface RoomView extends Room {
  unread: number;
  mentions: number;
  notify: NotifyLevel;
  hidden: boolean;
  lastReadId: string | null;
}

export interface Attachment {
  id: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  /** Same-origin URL; the session cookie authorizes it. */
  url: string;
}

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface ReplyPreview {
  id: string;
  userId: string;
  body: string | null;
  deleted: boolean;
  hasAttachments: boolean;
}

export interface Message {
  id: string;
  roomId: string;
  userId: string;
  clientId: string;
  /** null once deleted. */
  body: string | null;
  replyTo: ReplyPreview | null;
  attachments: Attachment[];
  reactions: Reaction[];
  mentions: string[];
  /** Global change sequence at the last mutation of this message (D-33). */
  seq: number;
  createdAt: number;
  editedAt: number | null;
  deletedAt: number | null;
}

export type InviteStatus = 'active' | 'used' | 'expired' | 'revoked';

export interface InviteView {
  id: string;
  intendedName: string | null;
  createdBy: string | null;
  createdAt: number;
  expiresAt: number;
  maxUses: number;
  uses: number;
  revokedAt: number | null;
  status: InviteStatus;
  redemptions: { userId: string; displayName: string; at: number }[];
}

/** A conversation topic the mascots moderate (D-51). Always 15, edited in the admin portal. */
export interface Topic {
  id: string;
  position: number;
  name: string;
  /** Whole words or phrases; matched without accents or case. */
  keywords: string[];
  /** Shown next to the name in a room once someone reaches `labelAt` strikes there. */
  label: string;
  labelAt: number;
  /** Mute in that room at this many strikes (never in the main room). */
  muteAt: number;
  muteHours: number;
  enabled: boolean;
  /** What the mascot says; empty = the mascot's own default line. */
  lines: { warn: string; label: string; mute: string };
}

/** Someone's public standing in a room: their labels and whether they're muted there. */
export interface Standing {
  roomId: string;
  userId: string;
  labels: string[];
  mutedUntil: number | null;
  /** Topic name of the active mute. */
  mutedTopic: string | null;
}

export interface MuteView {
  id: string;
  userId: string;
  roomId: string;
  topicId: string;
  topicName: string;
  until: number;
  createdAt: number;
}

export interface StrikeView {
  userId: string;
  roomId: string;
  topicId: string;
  topicName: string;
  count: number;
  labelAt: number;
  muteAt: number;
}

export interface AdminLogEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail: Record<string, unknown> | null;
  createdAt: number;
}
