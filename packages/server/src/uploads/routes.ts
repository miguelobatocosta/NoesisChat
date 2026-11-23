import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { ULID_RE } from '@pausa/shared';
import { checkOrigin, sendError, sessionFromRequest } from '../auth/routes';
import type { AppContext } from '../context';
import { newId } from '../ids';
import { toAttachment } from '../messages/service';
import { RATE_LIMITS } from '../rateLimit';
import { imageSize, sniffImage } from './images';

export function registerUploadRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/uploads', async (request, reply) => {
    if (!checkOrigin(ctx, request, reply)) return reply;
    const session = sessionFromRequest(ctx, request);
    if (!session) return sendError(reply, 'UNAUTHORIZED', 'No session');
    const [limit, windowMs] = RATE_LIMITS.upload;
    if (!ctx.limiter.hit(`upload:${session.deviceId}`, limit, windowMs))
      return sendError(reply, 'RATE_LIMITED');

    let file;
    try {
      file = await request.file({
        limits: { fileSize: ctx.config.uploadMaxBytes, files: 1, fields: 0 },
      });
    } catch {
      return sendError(reply, 'VALIDATION', 'Expected a multipart upload');
    }
    if (!file) return sendError(reply, 'VALIDATION', 'No file');

    const id = newId();
    const tmp = join(ctx.uploadsDir, `${id}.part`);
    const hash = createHash('sha256');
    let size = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        hash.update(chunk);
        size += chunk.length;
        cb(null, chunk);
      },
    });

    try {
      await pipeline(file.file, meter, createWriteStream(tmp, { flags: 'wx' }));
    } catch (err) {
      await unlink(tmp).catch(() => undefined);
      throw err;
    }
    if (file.file.truncated) {
      await unlink(tmp).catch(() => undefined);
      return sendError(reply, 'UPLOAD_TOO_LARGE', 'File too large');
    }

    // Read enough of the header to sniff the type and find JPEG dimensions behind EXIF blocks.
    const handle = await open(tmp, 'r');
    const head = Buffer.alloc(Math.min(size, 256 * 1024));
    await handle.read(head, 0, head.length, 0);
    await handle.close();

    const mime = sniffImage(head);
    if (!mime || size === 0) {
      await unlink(tmp).catch(() => undefined);
      return sendError(reply, 'UPLOAD_TYPE', 'Only PNG, JPEG, GIF and WebP images are accepted');
    }

    await rename(tmp, join(ctx.uploadsDir, id));
    const dims = imageSize(head, mime);
    ctx.db
      .prepare(
        `INSERT INTO attachments (id, message_id, uploader_id, mime, size, sha256, path, width, height, created_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        session.userId,
        mime,
        size,
        hash.digest('hex'),
        id,
        dims?.width ?? null,
        dims?.height ?? null,
        Date.now(),
      );

    return reply.send({
      ok: true,
      attachment: toAttachment({
        id,
        mime,
        size,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      }),
    });
  });

  app.get<{ Params: { id: string } }>('/files/:id', async (request, reply) => {
    const session = sessionFromRequest(ctx, request);
    if (!session) return sendError(reply, 'UNAUTHORIZED', 'No session');
    if (!ULID_RE.test(request.params.id)) return sendError(reply, 'NOT_FOUND', 'Not found');

    const row = ctx.db
      .prepare('SELECT id, mime, path, message_id, uploader_id FROM attachments WHERE id = ?')
      .get(request.params.id) as
      | { id: string; mime: string; path: string; message_id: string | null; uploader_id: string }
      | undefined;
    // Unsent uploads are visible only to their uploader (composer previews).
    if (!row || (row.message_id === null && row.uploader_id !== session.userId)) {
      return sendError(reply, 'NOT_FOUND', 'Not found');
    }

    const path = join(ctx.uploadsDir, row.path);
    const info = await stat(path).catch(() => null);
    if (!info) return sendError(reply, 'NOT_FOUND', 'Not found');

    return reply
      .header('Content-Type', row.mime)
      .header('Content-Length', info.size)
      .header('Content-Disposition', 'inline')
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .send(createReadStream(path));
  });
}

/** Deletes uploads never attached to a message after 24h (SPEC §3.4). */
export async function cleanupOrphans(
  ctx: AppContext,
  olderThanMs = 24 * 60 * 60 * 1000,
): Promise<number> {
  const rows = ctx.db
    .prepare('SELECT id, path FROM attachments WHERE message_id IS NULL AND created_at < ?')
    .all(Date.now() - olderThanMs) as { id: string; path: string }[];
  for (const row of rows) {
    ctx.db.prepare('DELETE FROM attachments WHERE id = ?').run(row.id);
    await unlink(join(ctx.uploadsDir, row.path)).catch(() => undefined);
  }
  return rows.length;
}
