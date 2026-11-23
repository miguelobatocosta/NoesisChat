import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, LogController } from 'fastify';
import type { ErrorBody, HealthResponse } from '@pausa/shared';
import { allowedOrigins } from './auth/origin';
import { registerAuthRoutes } from './auth/routes';
import type { Config } from './config';
import type { AppContext } from './context';
import { openDatabase } from './db';
import { ensureMascots } from './mascots/service';
import { Presence } from './members/presence';
import { RateLimiter } from './rateLimit';
import { createRealtime } from './realtime';
import { registerSecurityHeaders } from './security';
import { cleanupOrphans, registerUploadRoutes } from './uploads/routes';

declare module 'fastify' {
  interface FastifyInstance {
    pausa: AppContext;
  }
}

export interface BuildAppOptions {
  logger?: boolean;
}

/** Paths that belong to the server and must never fall back to the web app's index.html. */
const SERVER_PREFIXES = ['/api/', '/files/', '/socket.io/', '/health'];

export async function buildApp(
  config: Config,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ? { level: config.env === 'development' ? 'info' : 'warn' } : false,
    // Request logging only in development: fewer logs, nothing about who requested what in production.
    logController: new LogController({ disableRequestLogging: config.env !== 'development' }),
    // Client IP is resolved explicitly (CLAUDE.md rule 8), never from X-Forwarded-For.
    trustProxy: false,
    // On shutdown, don't wait for keep-alive or streaming connections; clients reconnect on their own.
    forceCloseConnections: true,
  });

  registerSecurityHeaders(app);

  mkdirSync(config.dataDir, { recursive: true });
  const uploadsDir = join(config.dataDir, 'uploads');
  mkdirSync(uploadsDir, { recursive: true });
  const db = openDatabase(join(config.dataDir, 'db.sqlite'));
  ensureMascots(db);

  const base = {
    config,
    db,
    log: app.log,
    limiter: new RateLimiter(),
    origins: allowedOrigins(config),
    presence: new Presence(),
    uploadsDir,
  };
  const { io, mascots } = createRealtime(app, base);
  const ctx: AppContext = { ...base, io, mascots };
  app.decorate('pausa', ctx);

  await app.register(fastifyMultipart);
  app.get('/health', async (): Promise<HealthResponse> => ({ ok: true }));
  registerAuthRoutes(app, ctx);
  registerUploadRoutes(app, ctx);

  const hasWebBuild = existsSync(join(config.webDist, 'index.html'));
  if (hasWebBuild) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      setHeaders(reply, filePath) {
        // Hashed build assets never change; index.html must always be revalidated.
        const immutable = /[\\/]assets[\\/]/.test(filePath);
        reply.header(
          'Cache-Control',
          immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  } else {
    app.log.warn(`Web build not found at ${config.webDist}. Run "pnpm build" (or use "pnpm dev").`);
  }

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '/';
    const isServerPath = SERVER_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(prefix),
    );
    const lastSegment = path.slice(path.lastIndexOf('/') + 1);
    const looksLikeFile = lastSegment.includes('.');

    if (hasWebBuild && request.method === 'GET' && !isServerPath && !looksLikeFile) {
      // Client-side route (e.g. /join): serve the app shell.
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    return notFound(reply);
  });

  void cleanupOrphans(ctx);
  const cleanup = setInterval(() => void cleanupOrphans(ctx), 60 * 60 * 1000);
  cleanup.unref();

  app.addHook('onClose', async () => {
    clearInterval(cleanup);
    mascots.dispose();
    await new Promise<void>((resolve) => void io.close(() => resolve()));
    db.close();
  });

  return app;
}

function notFound(reply: FastifyReply) {
  const body: ErrorBody = { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } };
  return reply.code(404).send(body);
}
