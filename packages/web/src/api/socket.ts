import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  ClientEventInput,
  ClientEventName,
  ClientEventResults,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@pausa/shared';
import { RequestError } from './errors';

export type PausaSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Same origin, cookie auth. Reconnects with exponential backoff and jitter. */
export function createSocket(): PausaSocket {
  return io({
    withCredentials: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.5,
    autoConnect: false,
  });
}

const TIMEOUT_MS = 10_000;

/** Emits an acknowledged event; resolves with data or throws RequestError. */
export function request<K extends ClientEventName>(
  socket: PausaSocket,
  name: K,
  payload: ClientEventInput<K>,
): Promise<ClientEventResults[K]> {
  if (!socket.connected) return Promise.reject(new RequestError('OFFLINE'));
  return new Promise((resolve, reject) => {
    const timed = socket.timeout(TIMEOUT_MS);
    const emit = timed.emit as unknown as (
      this: typeof timed,
      event: string,
      data: unknown,
      cb: (err: Error | null, res: Ack<ClientEventResults[K]>) => void,
    ) => void;
    emit.call(timed, name, payload, (err, res) => {
      if (err) return reject(new RequestError('TIMEOUT'));
      if (res.ok) resolve(res.data);
      else reject(new RequestError(res.error.code, res.error.message));
    });
  });
}
