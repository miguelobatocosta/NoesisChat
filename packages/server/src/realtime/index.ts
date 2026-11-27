import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import {
  type Ack,
  ClientEventSchemas,
  type ClientEventName,
  type ClientEventPayload,
  type ClientEventResults,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@pausa/shared';
import { listAdminLog, logAdmin, revokeMember, setRole } from '../admin/service';
import {
  createInvite,
  inviteBaseUrl,
  inviteLink,
  listInvites,
  revokeInvite,
} from '../auth/invites';
import { isAllowedRequest } from '../auth/origin';
import { findSession, touchDevice } from '../auth/sessions';
import { readSessionToken } from '../auth/tokens';
import { clientIp } from '../clientIp';
import {
  type AppContext,
  deviceRoom,
  type PausaIo,
  ROOM_MEMBERS,
  type SocketData,
  userRoom,
} from '../context';
import { AppError, toAckError } from '../errors';
import {
  listMembers,
  loadActor,
  markSeen,
  requireRole,
  toMember,
  type UserRow,
} from '../members/service';
import {
  deleteMessage,
  editMessage,
  history,
  markRead,
  sendMessage,
  sync,
  toggleReaction,
} from '../messages/service';
import {
  cancelDebt,
  confirmDebt,
  markPaid,
  pledge,
  recordMilestone,
  unpledge,
} from '../community/cakes';
import { commitSheet, parseSheet } from '../community/import';
import { addGuest, mergeGuest, personOfUser, setBirthday, setTeam } from '../community/people';
import { Community } from '../community/service';
import { searchMessages } from '../messages/search';
import { RATE_LIMITS } from '../rateLimit';
import { archiveRoom, createRoom, listRoomsFor, updatePrefs, updateRoom } from '../rooms/service';
import { Mascots } from '../mascots/service';
import { listModeration, Moderator, standingsFor } from '../moderation/service';
import { listTopicRows, toTopic, updateTopic } from '../moderation/topics';
import { requireRoom } from '../rooms/service';

type PausaSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

interface HandlerContext {
  ctx: AppContext;
  socket: PausaSocket;
  actor: UserRow;
}

type Handler<K extends ClientEventName> = (
  input: ClientEventPayload<K>,
  hc: HandlerContext,
) => ClientEventResults[K] | Promise<ClientEventResults[K]>;

export function createRealtime(
  app: FastifyInstance,
  ctx: Omit<AppContext, 'io' | 'mascots' | 'moderator' | 'community'>,
): { io: PausaIo; mascots: Mascots; moderator: Moderator; community: Community } {
  const io: PausaIo = new Server(app.server, {
    serveClient: false,
    // Origin check on every handshake and polling request (CLAUDE.md rule 3, SPEC §7.5).
    allowRequest: (req, callback) => callback(null, isAllowedRequest(req.headers, ctx.origins)),
    // Chat payloads are small; images go over HTTP.
    maxHttpBufferSize: 64 * 1024,
  });

  io.use((socket, next) => {
    const token = readSessionToken(socket.request.headers.cookie);
    const session = token ? findSession(ctx.db, token) : null;
    if (!session) {
      ctx.log.warn({ ip: clientIp(socket.request) }, 'socket auth failed');
      return next(new Error('UNAUTHORIZED'));
    }
    socket.data.userId = session.userId;
    socket.data.deviceId = session.deviceId;
    touchDevice(ctx.db, session.deviceId);
    next();
  });

  const full = { ...ctx, io } as AppContext;
  full.mascots = new Mascots(full);
  full.moderator = new Moderator(full);
  full.community = new Community(full);
  io.on('connection', (socket) => onConnection(full, socket));
  return { io, mascots: full.mascots, moderator: full.moderator, community: full.community };
}

function onConnection(ctx: AppContext, socket: PausaSocket): void {
  const { userId, deviceId } = socket.data;
  void socket.join([ROOM_MEMBERS, userRoom(userId), deviceRoom(deviceId)]);

  if (ctx.presence.add(userId, socket.id)) {
    socket.broadcast.to(ROOM_MEMBERS).emit('presence', { userId, online: true });
  }
  socket.on('disconnect', () => {
    if (ctx.presence.remove(userId, socket.id)) {
      markSeen(ctx.db, userId);
      ctx.io.to(ROOM_MEMBERS).emit('presence', { userId, online: false });
    }
  });

  const on = <K extends ClientEventName>(name: K, handler: Handler<K>) =>
    registerHandler(ctx, socket, name, handler);

  // --- rooms ---
  on('rooms:list', (_input, { actor }) => ({ rooms: listRoomsFor(ctx.db, actor.id) }));

  on('rooms:create', (input, { actor }) => {
    const room = createRoom(ctx.db, actor, input);
    const { unread: _u, mentions: _m, notify: _n, hidden: _h, lastReadId: _l, ...shared } = room;
    socket.broadcast.to(ROOM_MEMBERS).emit('room:created', { room: shared });
    ctx.mascots.onRoomCreated(room.id);
    return { room };
  });

  on('rooms:update', (input, { actor }) => {
    const room = updateRoom(ctx.db, actor, input);
    ctx.io.to(ROOM_MEMBERS).emit('room:updated', { room });
    return { room };
  });

  on('rooms:archive', (input, { actor }) => {
    const room = archiveRoom(ctx.db, actor, input);
    ctx.io.to(ROOM_MEMBERS).emit('room:updated', { room });
    return { room };
  });

  on('prefs:update', (input, { actor }) => updatePrefs(ctx.db, actor, input));

  // --- messages ---
  on('messages:history', (input) => history(ctx.db, input));
  on('messages:sync', (input) => sync(ctx.db, input));
  on('search:messages', (input) => searchMessages(ctx.db, input));

  on('messages:send', (input, { actor }) => {
    const { message, created } = sendMessage(ctx.db, actor, input);
    if (created) {
      ctx.io.to(ROOM_MEMBERS).emit('message:new', { message });
      ctx.mascots.onMessage(message, actor);
      ctx.moderator.onMessage(message, actor);
    }
    return { message };
  });

  on('messages:edit', (input, { actor }) => {
    const message = editMessage(ctx.db, actor, input);
    ctx.io.to(ROOM_MEMBERS).emit('message:updated', { message });
    return { message };
  });

  on('messages:delete', (input, { actor }) => {
    const { message, files, byModerator, authorId } = deleteMessage(ctx.db, actor, input);
    if (byModerator)
      logAdmin(ctx.db, actor.id, 'message.delete', 'message', message.id, { authorId });
    for (const file of files) void unlink(join(ctx.uploadsDir, file)).catch(() => undefined);
    ctx.io.to(ROOM_MEMBERS).emit('message:updated', { message });
    return { message };
  });

  on('reactions:toggle', (input, { actor }) => {
    const message = toggleReaction(ctx.db, actor, input);
    ctx.io.to(ROOM_MEMBERS).emit('message:updated', { message });
    return { message };
  });

  on('typing', (input, { actor }) => {
    socket.broadcast.to(ROOM_MEMBERS).emit('typing', { roomId: input.roomId, userId: actor.id });
    return {};
  });

  on('read:mark', (input, { actor }) => markRead(ctx.db, actor, input));

  on('members:list', () => ({ members: listMembers(ctx.db, ctx.presence) }));

  // --- admin (role re-checked from the database on every call) ---
  on('admin:invites:create', (input, { actor }) => {
    requireRole(actor, ['host', 'admin']);
    const { invite, code } = createInvite(ctx.db, {
      createdBy: actor.id,
      intendedName: input.intendedName ?? null,
      expiresIn: input.expiresIn,
    });
    logAdmin(ctx.db, actor.id, 'invite.create', 'invite', invite.id, {
      intendedName: invite.intendedName,
      expiresIn: input.expiresIn,
    });
    const link = inviteLink(inviteBaseUrl(ctx.config, socket.handshake.headers.origin), code);
    return { invite, link };
  });

  on('admin:invites:list', (_input, { actor }) => {
    requireRole(actor, ['host', 'admin']);
    return { invites: listInvites(ctx.db) };
  });

  on('admin:invites:revoke', (input, { actor }) => {
    requireRole(actor, ['host', 'admin']);
    const invite = revokeInvite(ctx.db, input.inviteId);
    logAdmin(ctx.db, actor.id, 'invite.revoke', 'invite', invite.id);
    return { invite };
  });

  on('admin:members:revoke', (input, { actor }) => {
    const target = revokeMember(ctx.db, actor, input.userId);
    kickUser(ctx, target.id);
    const member = toMember(target, ctx.presence);
    ctx.io.to(ROOM_MEMBERS).emit('member:updated', { member });
    return { member };
  });

  on('admin:members:setRole', (input, { actor }) => {
    const target = setRole(ctx.db, actor, input);
    const member = toMember(target, ctx.presence);
    ctx.io.to(ROOM_MEMBERS).emit('member:updated', { member });
    return { member };
  });

  on('admin:log:list', (input, { actor }) => {
    requireRole(actor, ['host', 'admin']);
    return listAdminLog(ctx.db, input.before);
  });

  // --- cakes (D-53) ---
  const community = ctx.community;
  const done = () => {
    community.changed();
    return {};
  };
  const staff = (actor: UserRow) => requireRole(actor, ['host', 'admin']);

  on('community:state', () => community.state());

  on('cakes:record', (input, { actor }) => {
    const debt = recordMilestone(ctx.db, actor, input);
    community.milestoneRecorded(debt.id, actor.id);
    return done();
  });
  on('cakes:confirm', (input, { actor }) => {
    const debt = confirmDebt(ctx.db, actor, input.debtId);
    community.announce('confirmed', {
      name: community.nameFor(debt.personId),
      reason: debt.reason,
    });
    return done();
  });
  on('cakes:cancel', (input, { actor }) => {
    const debt = cancelDebt(ctx.db, actor, input.debtId);
    logAdmin(ctx.db, actor.id, 'cake.cancel', 'debt', debt.id, { reason: debt.reason });
    return done();
  });
  on('cakes:pledge', (input, { actor }) => {
    const debt = pledge(ctx.db, actor, input.debtId, input.date, community.today());
    community.announce('pledge', {
      name: community.nameFor(debt.personId),
      reason: debt.reason,
      date: input.date.split('-').reverse().join('/'),
    });
    return done();
  });
  on('cakes:unpledge', (input, { actor }) => {
    unpledge(ctx.db, actor, input.debtId);
    return done();
  });
  on('cakes:paid', (input, { actor }) => {
    const debt = markPaid(ctx.db, actor, input.debtId, community.today());
    community.announce(
      'paid',
      { name: community.nameFor(debt.personId), reason: debt.reason },
      { type: 'paid', ref: debt.id },
    );
    return done();
  });
  on('people:setBirthday', (input, { actor }) => {
    if (personOfUser(ctx.db, actor.id)?.id !== input.personId) staff(actor);
    setBirthday(ctx.db, input.personId, input.birthday);
    return done();
  });
  on('admin:people:addGuest', (input, { actor }) => {
    staff(actor);
    addGuest(ctx.db, input.name, true);
    return done();
  });
  on('admin:people:merge', (input, { actor }) => {
    staff(actor);
    mergeGuest(ctx.db, input.guestId, input.userId);
    logAdmin(ctx.db, actor.id, 'people.merge', 'user', input.userId);
    return done();
  });
  on('admin:people:setTeam', (input, { actor }) => {
    staff(actor);
    setTeam(ctx.db, input.personId, input.inTeam);
    return done();
  });
  on('admin:settings:update', (input, { actor }) => {
    staff(actor);
    community.setNoshowLimit(input.noshowLimit);
    return done();
  });
  on('admin:import:preview', (input, { actor }) => {
    staff(actor);
    return { rows: parseSheet(ctx.db, input.sheet, input.text) };
  });
  on('admin:import:commit', (input, { actor }) => {
    staff(actor);
    const result = commitSheet(ctx.db, input.sheet, input.text);
    logAdmin(ctx.db, actor.id, 'import.commit', 'sheet', input.sheet, result);
    community.changed();
    return result;
  });

  // --- topic moderation (D-51) ---
  on('moderation:standings', (input) => {
    requireRoom(ctx.db, input.roomId);
    return { standings: standingsFor(ctx.db, input.roomId) };
  });

  on('admin:topics:list', (_input, { actor }) => {
    requireRole(actor, ['host', 'admin']);
    return { topics: listTopicRows(ctx.db).map(toTopic) };
  });

  on('admin:topics:update', (input, { actor }) => {
    requireRole(actor, ['host', 'admin']);
    const topic = updateTopic(ctx.db, input);
    logAdmin(ctx.db, actor.id, 'topic.update', 'topic', topic.id, { name: topic.name });
    return { topic };
  });

  on('admin:moderation:list', (_input, { actor }) => {
    requireRole(actor, ['host', 'admin']);
    return listModeration(ctx.db);
  });

  on('admin:moderation:lift', (input, { actor }) => {
    requireRole(actor, ['host', 'admin']);
    return { standing: ctx.moderator.lift(input.muteId, actor) };
  });

  on('admin:moderation:reset', (input, { actor }) => {
    requireRole(actor, ['host', 'admin']);
    return {
      standing: ctx.moderator.reset(input.userId, input.roomId, input.topicId, actor),
    };
  });
}

/** Tells every socket of a user that the session is over, then disconnects them (SPEC §7.4). */
function kickUser(ctx: AppContext, userId: string): void {
  ctx.io.to(userRoom(userId)).emit('session:revoked');
  ctx.io.in(userRoom(userId)).disconnectSockets(true);
}

export function kickDevice(ctx: AppContext, deviceId: string): void {
  ctx.io.to(deviceRoom(deviceId)).emit('session:revoked');
  ctx.io.in(deviceRoom(deviceId)).disconnectSockets(true);
}

function rateFor(name: ClientEventName): readonly [number, number] {
  return name in RATE_LIMITS ? RATE_LIMITS[name as keyof typeof RATE_LIMITS] : RATE_LIMITS.default;
}

/** Validation, rate limit, fresh actor, uniform ack envelope. Every event goes through here. */
function registerHandler<K extends ClientEventName>(
  ctx: AppContext,
  socket: PausaSocket,
  name: K,
  handler: Handler<K>,
): void {
  const schema = ClientEventSchemas[name] as unknown as
    z.ZodType<ClientEventPayload<K>> | undefined;
  if (!schema) return;
  const [limit, windowMs] = rateFor(name);

  socket.on(
    name as never,
    (async (payload: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return; // every client event must be acknowledged
      const reply = ack as (res: Ack<ClientEventResults[K]>) => void;

      if (!ctx.limiter.hit(`${name}:${socket.data.deviceId}`, limit, windowMs)) {
        return reply({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
      }
      const parsed = schema.safeParse(payload ?? {});
      if (!parsed.success) {
        return reply({
          ok: false,
          error: { code: 'VALIDATION', message: z.prettifyError(parsed.error) },
        });
      }
      try {
        const actor = loadActor(ctx.db, socket.data.userId);
        const data = await handler(parsed.data, { ctx, socket, actor });
        reply({ ok: true, data });
      } catch (err) {
        if (!(err instanceof AppError))
          ctx.log.error({ err, event: name }, 'socket handler failed');
        reply({ ok: false, error: toAckError(err) });
        if (err instanceof AppError && err.code === 'UNAUTHORIZED') socket.disconnect(true);
      }
    }) as never,
  );
}
