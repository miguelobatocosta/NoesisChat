import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import {
  type Ack,
  type ClientEventInput,
  type ClientEventName,
  type ClientEventResults,
  type ClientToServerEvents,
  type Role,
  type ServerToClientEvents,
  SESSION_COOKIE,
} from '@pausa/shared';
import { buildApp } from '../src/app';
import { createInvite, redeemInvite } from '../src/auth/invites';
import { loadConfig } from '../src/config';
import type { AppContext } from '../src/context';
import { tempDir } from './helpers';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface TestUser {
  id: string;
  name: string;
  token: string;
  deviceId: string;
  cookie: string;
}

export async function startTestServer(env: Record<string, string> = {}) {
  const dataDir = tempDir('pausa-data-');
  const config = loadConfig({
    root: tempDir(),
    env: { NODE_ENV: 'test', DATA_DIR: dataDir, ...env },
  });
  const app = await buildApp(config);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;
  // allowedOrigins() is derived from config.port, which stays 4747 when listening on a random port.
  const origin = `http://localhost:${config.port}`;
  const ctx: AppContext = app.pausa;
  const sockets: ClientSocket[] = [];

  /** Creates a user through the real invite path; promotes directly in the DB for admin/host. */
  function user(name: string, role: Role = 'member'): TestUser {
    const { code } = createInvite(ctx.db, {
      createdBy: null,
      grantRole: role === 'host' ? 'host' : 'member',
      expiresIn: '24h',
    });
    const res = redeemInvite(ctx.db, { code, displayName: name, deviceLabel: 'test' });
    if (role === 'admin')
      ctx.db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(res.user.id);
    return {
      id: res.user.id,
      name,
      token: res.token,
      deviceId: res.deviceId,
      cookie: `${SESSION_COOKIE}=${res.token}`,
    };
  }

  function socket(u: TestUser | null, opts: { origin?: string } = {}): ClientSocket {
    const headers: Record<string, string> = { origin: opts.origin ?? origin };
    if (u) headers['cookie'] = u.cookie;
    const s: ClientSocket = ioClient(url, {
      transports: ['websocket'],
      extraHeaders: headers,
      forceNew: true,
      reconnection: false,
    });
    sockets.push(s);
    return s;
  }

  /** Connects and resolves once the server accepted the socket. */
  async function connect(u: TestUser, opts: { origin?: string } = {}): Promise<ClientSocket> {
    const s = socket(u, opts);
    await new Promise<void>((resolve, reject) => {
      s.once('connect', () => resolve());
      s.once('connect_error', (err) => reject(err));
    });
    return s;
  }

  async function http(
    path: string,
    init: RequestInit & { user?: TestUser; origin?: string | null } = {},
  ) {
    const headers = new Headers(init.headers);
    if (init.origin !== null) headers.set('origin', init.origin ?? origin);
    if (init.user) headers.set('cookie', init.user.cookie);
    return fetch(`${url}${path}`, { ...init, headers });
  }

  async function close() {
    for (const s of sockets) s.disconnect();
    await app.close();
  }

  return { app, ctx, config, url, origin, user, socket, connect, http, close };
}

export type TestServer = Awaited<ReturnType<typeof startTestServer>>;

export function emit<K extends ClientEventName>(
  socket: ClientSocket,
  name: K,
  payload: ClientEventInput<K> | Record<string, unknown>,
): Promise<Ack<ClientEventResults[K]>> {
  return new Promise((resolve) => {
    (socket.emit as (n: string, p: unknown, cb: (r: Ack<ClientEventResults[K]>) => void) => void)(
      name,
      payload,
      resolve,
    );
  });
}

/** emit() that fails the test unless the ack is ok, returning the data. */
export async function call<K extends ClientEventName>(
  socket: ClientSocket,
  name: K,
  payload: ClientEventInput<K>,
): Promise<ClientEventResults[K]> {
  const res = await emit(socket, name, payload);
  if (!res.ok) throw new Error(`${name} failed: ${res.error.code} ${res.error.message}`);
  return res.data;
}

export function nextEvent<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  name: E,
  timeoutMs = 2000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for ${String(name)}`)),
      timeoutMs,
    );
    (socket.once as (n: string, cb: (p: unknown) => void) => void)(name as string, (payload) => {
      clearTimeout(timer);
      resolve(payload as Parameters<ServerToClientEvents[E]>[0]);
    });
  });
}

/** Collects every occurrence of an event until stop() is called. */
export function collect<E extends keyof ServerToClientEvents>(socket: ClientSocket, name: E) {
  const items: Parameters<ServerToClientEvents[E]>[0][] = [];
  const handler = (p: unknown) => items.push(p as Parameters<ServerToClientEvents[E]>[0]);
  (socket.on as (n: string, cb: (p: unknown) => void) => void)(name as string, handler);
  return items;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let clientCounter = 0;
export const cid = () => `test-client-${Date.now()}-${++clientCounter}`;
