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

/** Authors' consecutive messages within this window are grouped under one header (SPEC §3.2). */
export const GROUPING_WINDOW_MS = 5 * 60 * 1000;
