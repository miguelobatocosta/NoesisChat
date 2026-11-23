import type { IncomingHttpHeaders } from 'node:http';
import type { Config } from '../config';

/** Origins allowed to make state-changing requests and open sockets (CLAUDE.md rule 3). */
export function allowedOrigins(config: Config): Set<string> {
  const origins = new Set<string>([
    `http://localhost:${config.port}`,
    `http://127.0.0.1:${config.port}`,
  ]);
  if (config.publicOrigin) origins.add(config.publicOrigin);
  if (config.env === 'development') {
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:5173');
  }
  return origins;
}

/**
 * Browsers always send Origin on cross-origin requests, WebSocket upgrades and every POST. Same-origin
 * GETs (e.g. Socket.IO's polling transport) may omit it but carry Sec-Fetch-Site: same-origin.
 * Anything else, including a request with neither header, is refused.
 */
export function isAllowedRequest(headers: IncomingHttpHeaders, origins: Set<string>): boolean {
  const origin = headers.origin;
  if (origin) return origins.has(origin);
  return headers['sec-fetch-site'] === 'same-origin';
}

/** Secure cookies whenever the browser is on https (the tunnel), plain cookies on http localhost. */
export function isSecureContext(headers: IncomingHttpHeaders, config: Config): boolean {
  const origin = headers.origin;
  if (origin) return origin.startsWith('https://');
  return config.publicOrigin?.startsWith('https://') ?? false;
}
