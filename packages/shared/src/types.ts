import type { MascotKey } from './constants';

/** Wire types sent by the server. Inputs from clients are validated with the zod schemas in events.ts. */

export type Role = 'host' | 'admin' | 'member';
export type NotifyLevel = 'all' | 'mentions' | 'none';

export interface SessionUser {
  id: string;
  displayName: string;
  role: Role;
}

/** What a verified Cloudflare Access email can do here (D-52). */
export type AccessStatus = 'registered' | 'new' | 'revoked';

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

/** An interactive card a mascot posts (D-53/D-54); rendered from live community state. */
export type CardType = 'milestone' | 'birthday' | 'paid' | 'cakeCall' | 'officePoll' | 'officeDay';
export interface MessageCard {
  type: CardType;
  /** A debt id, or a date for office-day cards. */
  ref: string;
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
  /** Interactive card (community posts), or null for an ordinary message. */
  card: MessageCard | null;
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

// --- cakes (D-53) -----------------------------------------------------------------------------------

/** A member (userId set) or a guest who doesn't use Pausa. */
export interface Person {
  id: string;
  name: string;
  userId: string | null;
  /** 'MM-DD' */
  birthday: string | null;
  inTeam: boolean;
}

export type DebtKind = 'milestone' | 'birthday' | 'noshow' | 'import';
export type DebtStatus = 'pending' | 'owed' | 'paid' | 'cancelled';

export interface CakeDebt {
  id: string;
  personId: string;
  reason: string;
  kind: DebtKind;
  /** Local 'YYYY-MM-DD'. */
  occurredOn: string;
  status: DebtStatus;
  recordedBy: string | null;
  confirmedBy: string | null;
  pledgedOn: string | null;
  pledgeKind: 'volunteer' | 'nominated' | null;
  paidOn: string | null;
  createdAt: number;
}

// --- office days (D-54) ------------------------------------------------------------------------------

export interface OfficeWeek {
  /** Monday, 'YYYY-MM-DD'. */
  weekStart: string;
  status: 'voting' | 'decided';
  chosenOn: string | null;
  /** Votes per weekday, Mon..Fri. */
  votes: { personId: string; weekday: number }[];
}

export interface OfficeDay {
  date: string;
  weekStart: string;
  source: 'vote' | 'admin' | 'import';
  closed: boolean;
}

export type Judgement = 'justified' | 'unjustified' | 'pending';

export interface Attendance {
  date: string;
  personId: string;
  plan: 'going' | 'not_going' | null;
  planReason: string | null;
  /** Said before the day: advance notice. */
  noticeGiven: boolean;
  status: 'present' | 'absent' | null;
  excuse: string | null;
  judgement: Judgement | null;
  /** Counted towards a no-show cake (or imported history, which never counts). */
  counted: boolean;
}

export interface CommunityState {
  people: Person[];
  debts: CakeDebt[];
  /** This week and next (when open), newest last. */
  weeks: OfficeWeek[];
  /** The last 12 office days and any upcoming ones. */
  days: OfficeDay[];
  attendance: Attendance[];
  settings: { noshowLimit: number };
  /** The server's local date, 'YYYY-MM-DD'. */
  today: string;
}

export type ImportSheet = 'cakes' | 'birthdays' | 'attendance';
export interface ImportRow {
  line: number;
  name: string;
  date: string | null;
  reason: string;
  status: 'paid' | 'owed';
  /** Existing person it matches, or null when a guest will be created. */
  personId: string | null;
  error: string | null;
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
