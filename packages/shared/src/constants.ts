/**
 * The app's display name. This is the single place it lives (CLAUDE.md, DECISIONS D-40).
 * Rename here, rebuild, done.
 */
export const APP_NAME = 'Pausa';

/** Text placeholder for the Noesis logo until the official file is approved (BRAND.md §6, D-01). */
export const BRAND_WORDMARK = 'NOESIS';

export const DEFAULT_PORT = 4747;

/** HttpOnly session cookie carrying the device token (CLAUDE.md rule 2). */
export const SESSION_COOKIE = 'pausa_session';

export const LIMITS = {
  messageLength: 4000,
  attachmentsPerMessage: 10,
  historyPage: 50,
  syncMax: 200,
  roomName: 40,
  roomDescription: 200,
  displayName: 32,
  emojiLength: 16,
} as const;

/** The only upload types accepted, decided by magic bytes on the server (SPEC §3.4). */
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type ImageMime = (typeof IMAGE_MIME_TYPES)[number];

export const INVITE_EXPIRY_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
} as const;
export type InviteExpiry = keyof typeof INVITE_EXPIRY_MS;

/** Fixed ID of the protected main room, seeded by migration 0001. */
export const MAIN_ROOM_ID = '00000000000000000000000001';

/**
 * Room mascots (D-49): server-side bot users with fixed IDs, one character per room.
 * Their lines live in packages/server/src/mascots/lines.pt-PT.json, their drawings in the web app.
 */
export const MASCOTS = [
  { key: 'lurdes', userId: '0000000000000000000000MA01', name: 'Dona Lurdes' },
  { key: 'bolacha', userId: '0000000000000000000000MA02', name: 'Bolacha' },
  { key: 'faisca', userId: '0000000000000000000000MA03', name: 'Faísca' },
  { key: 'ferreira', userId: '0000000000000000000000MA04', name: 'Sr. Ferreira' },
  { key: 'pixel', userId: '0000000000000000000000MA05', name: 'Pixel' },
  { key: 'nuvem', userId: '0000000000000000000000MA06', name: 'Nuvem' },
] as const;
export type MascotKey = (typeof MASCOTS)[number]['key'];
export const MASCOT_KEYS = MASCOTS.map((m) => m.key) as [MascotKey, ...MascotKey[]];
/** #geral's mascot. */
export const MAIN_MASCOT: MascotKey = 'lurdes';

export function mascotByKey(key: MascotKey) {
  return MASCOTS.find((m) => m.key === key)!;
}

export function mascotByUserId(userId: string) {
  return MASCOTS.find((m) => m.userId === userId);
}

/** Authors' consecutive messages within this window are grouped under one header (SPEC §3.2). */
export const GROUPING_WINDOW_MS = 5 * 60 * 1000;
