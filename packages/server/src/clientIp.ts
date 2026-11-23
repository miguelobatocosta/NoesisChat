import type { IncomingMessage } from 'node:http';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * CLAUDE.md rule 8: behind cloudflared every request comes from loopback, and the real client IP is
 * in CF-Connecting-IP. That header is trusted ONLY when the TCP peer is loopback.
 */
export function clientIp(req: IncomingMessage): string {
  const peer = req.socket.remoteAddress ?? 'unknown';
  if (LOOPBACK.has(peer)) {
    const header = req.headers['cf-connecting-ip'];
    const value = Array.isArray(header) ? header[0] : header;
    if (value && /^[0-9a-fA-F:.]{2,45}$/.test(value)) return value;
  }
  return peer;
}
