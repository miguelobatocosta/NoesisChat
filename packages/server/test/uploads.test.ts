import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Attachment, MAIN_ROOM_ID } from '@pausa/shared';
import { imageSize, sniffImage } from '../src/uploads/images';
import { cleanupOrphans } from '../src/uploads/routes';
import { FIXTURES } from './fixtures';
import { call, cid, startTestServer, type TestServer, type TestUser } from './harness';

let s: TestServer;
beforeEach(async () => {
  s = await startTestServer({ UPLOAD_MAX_MB: '1' });
});
afterEach(async () => {
  await s.close();
});

async function upload(
  user: TestUser | undefined,
  bytes: Buffer,
  filename = 'foto.png',
  opts: { origin?: string } = {},
) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)]), filename);
  const init: Parameters<TestServer['http']>[1] = { method: 'POST', body: form };
  if (user) init.user = user;
  if (opts.origin) init.origin = opts.origin;
  return s.http('/api/uploads', init);
}

async function uploadOk(user: TestUser, bytes: Buffer): Promise<Attachment> {
  const res = await upload(user, bytes);
  expect(res.status).toBe(200);
  return ((await res.json()) as { attachment: Attachment }).attachment;
}

describe('POST /api/uploads', () => {
  it.each([
    ['png', 'image/png', 3, 2],
    ['jpeg', 'image/jpeg', 3, 2],
    ['gif', 'image/gif', 3, 2],
    ['webpLossless', 'image/webp', 3, 2],
    ['webpLossy', 'image/webp', 5, 4],
  ] as const)('accepts %s and reads its dimensions', async (fixture, mime, width, height) => {
    const att = await uploadOk(s.user('Ana'), FIXTURES[fixture]);
    expect(att).toMatchObject({
      mime,
      width,
      height,
      size: FIXTURES[fixture].length,
      url: `/files/${att.id}`,
    });
  });

  it('decides the type from bytes, not the name: an .exe named .png is refused', async () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0x90)]);
    const res = await upload(s.user('Ana'), exe, 'gato.png');
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ error: { code: 'UPLOAD_TYPE' } });
  });

  it('refuses SVG (it can carry script)', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect((await upload(s.user('Ana'), svg, 'x.svg')).status).toBe(415);
  });

  it('refuses files over the size cap and leaves nothing on disk', async () => {
    const big = Buffer.concat([FIXTURES.png, Buffer.alloc(1024 * 1024 + 10)]);
    const res = await upload(s.user('Ana'), big);
    expect(res.status).toBe(413);
    expect(readdirSync(s.ctx.uploadsDir)).toEqual([]);
  });

  it('requires a session and our Origin', async () => {
    expect((await upload(undefined, FIXTURES.png)).status).toBe(401);
    expect(
      (await upload(s.user('Ana'), FIXTURES.png, 'a.png', { origin: 'https://evil.example' }))
        .status,
    ).toBe(403);
  });

  it('stores files under random names, never the user’s', async () => {
    const att = await uploadOk(s.user('Ana'), FIXTURES.png);
    expect(readdirSync(s.ctx.uploadsDir)).toEqual([att.id]);
  });
});

describe('GET /files/:id', () => {
  it('serves to the uploader before sending, to everyone after, never without a session', async () => {
    const ana = s.user('Ana');
    const rui = s.user('Rui');
    const att = await uploadOk(ana, FIXTURES.png);

    const own = await s.http(att.url, { user: ana });
    expect(own.status).toBe(200);
    expect(own.headers.get('content-type')).toBe('image/png');
    expect(own.headers.get('x-content-type-options')).toBe('nosniff');
    expect(own.headers.get('content-disposition')).toBe('inline');
    expect(Buffer.from(await own.arrayBuffer()).equals(FIXTURES.png)).toBe(true);

    expect((await s.http(att.url, { user: rui })).status).toBe(404); // not sent yet
    expect((await s.http(att.url)).status).toBe(401);

    const sock = await s.connect(ana);
    const { message } = await call(sock, 'messages:send', {
      roomId: MAIN_ROOM_ID,
      clientId: cid(),
      body: '',
      attachmentIds: [att.id],
    });
    expect(message.attachments.map((a) => a.id)).toEqual([att.id]);
    expect((await s.http(att.url, { user: rui })).status).toBe(200);
  });

  it('someone else’s upload cannot be attached to my message', async () => {
    const att = await uploadOk(s.user('Ana'), FIXTURES.png);
    const rui = await s.connect(s.user('Rui'));
    const res = await new Promise((resolve) =>
      rui.emit(
        'messages:send',
        { roomId: MAIN_ROOM_ID, clientId: cid(), body: 'roubada', attachmentIds: [att.id] },
        resolve,
      ),
    );
    expect(res).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('deleting the message deletes the file from disk', async () => {
    const ana = s.user('Ana');
    const att = await uploadOk(ana, FIXTURES.jpeg);
    const sock = await s.connect(ana);
    const { message } = await call(sock, 'messages:send', {
      roomId: MAIN_ROOM_ID,
      clientId: cid(),
      body: 'foto',
      attachmentIds: [att.id],
    });
    await call(sock, 'messages:delete', { messageId: message.id });
    await new Promise((r) => setTimeout(r, 50));
    expect(existsSync(join(s.ctx.uploadsDir, att.id))).toBe(false);
    expect((await s.http(att.url, { user: ana })).status).toBe(404);
  });

  it('orphan cleanup removes unsent uploads older than 24h', async () => {
    const att = await uploadOk(s.user('Ana'), FIXTURES.gif);
    expect(await cleanupOrphans(s.ctx)).toBe(0);
    s.ctx.db
      .prepare('UPDATE attachments SET created_at = ? WHERE id = ?')
      .run(Date.now() - 25 * 3600_000, att.id);
    expect(await cleanupOrphans(s.ctx)).toBe(1);
    expect(existsSync(join(s.ctx.uploadsDir, att.id))).toBe(false);
  });
});

describe('image sniffing', () => {
  it('recognises the four types and nothing else', () => {
    expect(sniffImage(FIXTURES.png)).toBe('image/png');
    expect(sniffImage(FIXTURES.jpeg)).toBe('image/jpeg');
    expect(sniffImage(FIXTURES.gif)).toBe('image/gif');
    expect(sniffImage(FIXTURES.webpLossy)).toBe('image/webp');
    expect(sniffImage(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(sniffImage(Buffer.from('RIFF0000WAVE'))).toBeNull();
  });
  it('returns null instead of throwing on truncated headers', () => {
    expect(imageSize(FIXTURES.png.subarray(0, 10), 'image/png')).toBeNull();
    expect(imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBeNull();
  });
});
