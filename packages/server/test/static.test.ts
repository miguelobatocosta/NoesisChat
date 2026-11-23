import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { fakeWebBuild, testConfig } from './helpers';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function appWithWeb() {
  app = await buildApp(testConfig({ WEB_DIST: fakeWebBuild() }));
  return app;
}

describe('web app serving', () => {
  it('serves index.html at / with no-cache and security headers', async () => {
    const res = await (await appWithWeb()).inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.body).toContain('<div id="root">');
  });

  it('serves hashed assets as immutable', async () => {
    const res = await (await appWithWeb()).inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('falls back to index.html for client-side routes', async () => {
    const res = await (await appWithWeb()).inject({ method: 'GET', url: '/join' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<div id="root">');
  });

  it('does not fall back for missing files', async () => {
    const res = await (await appWithWeb()).inject({ method: 'GET', url: '/assets/missing.js' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ ok: false });
  });

  it.each(['/api/whatever', '/files/123', '/socket.io/x', '/health/extra'])(
    'never serves the app shell for server path %s',
    async (url) => {
      const res = await (await appWithWeb()).inject({ method: 'GET', url });
      expect([401, 404]).toContain(res.statusCode);
      expect(res.headers['content-type']).toContain('application/json');
    },
  );

  it('does not fall back for non-GET requests', async () => {
    const res = await (await appWithWeb()).inject({ method: 'POST', url: '/join' });
    expect(res.statusCode).toBe(404);
  });

  it('works without a web build (404 JSON at /)', async () => {
    app = await buildApp(testConfig({ WEB_DIST: '/definitely/not/here' }));
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(404);
  });
});
