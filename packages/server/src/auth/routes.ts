import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  type ErrorCode,
  JoinRequest,
  type SessionResponse,
  type SessionState,
} from '@pausa/shared';
import { clientIp } from '../clientIp';
import { type AppContext, ROOM_MEMBERS } from '../context';
import { AppError } from '../errors';
import { getUser, toMember, toSessionUser } from '../members/service';
import { kickDevice } from '../realtime';
import { redeemInvite } from './invites';
import { isAllowedRequest, isSecureContext } from './origin';
import { deviceLabel, findSession, revokeDevice, type Session } from './sessions';
import { clearSessionCookie, readSessionToken, sessionCookie } from './tokens';

const STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  BAD_ORIGIN: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  NAME_TAKEN: 409,
  INVITE_INVALID: 400,
  UPLOAD_TOO_LARGE: 413,
  UPLOAD_TYPE: 415,
  RATE_LIMITED: 429,
};

export function sendError(reply: FastifyReply, code: ErrorCode, message: string = code) {
  return reply.code(STATUS[code] ?? 500).send({ ok: false, error: { code, message } });
}

/** CLAUDE.md rule 3 for HTTP: state-changing requests must come from our own origin. */
export function checkOrigin(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  if (isAllowedRequest(request.headers, ctx.origins)) return true;
  ctx.log.warn({ ip: clientIp(request.raw), origin: request.headers.origin }, 'rejected origin');
  void sendError(reply, 'BAD_ORIGIN', 'Bad origin');
  return false;
}

export function sessionFromRequest(ctx: AppContext, request: FastifyRequest): Session | null {
  const token = readSessionToken(request.headers.cookie);
  return token ? findSession(ctx.db, token) : null;
}

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/join', { bodyLimit: 4096 }, async (request, reply) => {
    if (!checkOrigin(ctx, request, reply)) return reply;
    const ip = clientIp(request.raw);
    if (!ctx.limiter.hit(`join:${ip}`, ctx.config.joinRatePerMin, 60_000))
      return sendError(reply, 'RATE_LIMITED');

    const parsed = JoinRequest.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 'VALIDATION', 'Invalid join request');

    try {
      const result = redeemInvite(ctx.db, {
        code: parsed.data.code,
        displayName: parsed.data.displayName,
        deviceLabel: deviceLabel(request.headers['user-agent']),
      });
      reply.header(
        'Set-Cookie',
        sessionCookie(result.token, isSecureContext(request.headers, ctx.config)),
      );
      if (result.isNewUser) {
        ctx.io
          .to(ROOM_MEMBERS)
          .emit('member:updated', { member: toMember(result.user, ctx.presence) });
      }
      const body: SessionResponse = { ok: true, user: toSessionUser(result.user) };
      return reply.send(body);
    } catch (err) {
      if (err instanceof AppError) {
        if (err.code === 'INVITE_INVALID') ctx.log.warn({ ip }, 'invalid invite redemption');
        return sendError(reply, err.code, err.message);
      }
      throw err;
    }
  });

  app.get('/api/session', async (request, reply) => {
    const session = sessionFromRequest(ctx, request);
    const user = session ? getUser(ctx.db, session.userId) : undefined;
    reply.header('Cache-Control', 'no-store');
    const body: SessionState = { ok: true, user: session && user ? toSessionUser(user) : null };
    return reply.send(body);
  });

  app.post('/api/logout', { bodyLimit: 1024 }, async (request, reply) => {
    if (!checkOrigin(ctx, request, reply)) return reply;
    const session = sessionFromRequest(ctx, request);
    if (session) {
      revokeDevice(ctx.db, session.deviceId);
      kickDevice(ctx, session.deviceId);
    }
    reply.header('Set-Cookie', clearSessionCookie(isSecureContext(request.headers, ctx.config)));
    return reply.send({ ok: true });
  });
}
