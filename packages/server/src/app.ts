import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { LogController, type FastifyInstance, type FastifyReply } from 'fastify';
import type { ErrorBody, HealthResponse } from '@pausa/shared';
import type { Config } from './config';
import { registerSecurityHeaders } from './security';

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
    // Client IP handling behind the tunnel arrives in Phase 4 (CLAUDE.md rule 8).
    trustProxy: false,
  });

  registerSecurityHeaders(app);

  app.get('/health', async (): Promise<HealthResponse> => ({ ok: true }));

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

  return app;
}

function notFound(reply: FastifyReply) {
  const body: ErrorBody = { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } };
  return reply.code(404).send(body);
}
