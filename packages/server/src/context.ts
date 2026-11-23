import type { FastifyBaseLogger } from 'fastify';
import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@pausa/shared';
import type { Config } from './config';
import type { Db } from './db';
import type { Mascots } from './mascots/service';
import type { Presence } from './members/presence';
import type { RateLimiter } from './rateLimit';

export interface SocketData {
  userId: string;
  deviceId: string;
}

export type PausaIo = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** Everything request handlers need. Built once in buildApp(). */
export interface AppContext {
  config: Config;
  db: Db;
  log: FastifyBaseLogger;
  limiter: RateLimiter;
  origins: Set<string>;
  presence: Presence;
  io: PausaIo;
  uploadsDir: string;
  /** Room mascots (D-49). */
  mascots: Mascots;
}

/** Socket.IO rooms. */
export const ROOM_MEMBERS = 'members';
export const userRoom = (userId: string) => `user:${userId}`;
export const deviceRoom = (deviceId: string) => `device:${deviceId}`;
