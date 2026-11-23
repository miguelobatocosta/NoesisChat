import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ErrorBody, HealthResponse } from '@pausa/shared';
import { buildApp } from '../src/app';
import { CONTENT_SECURITY_POLICY } from '../src/security';
import { testConfig } from './helpers';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /health', () => {
  it('returns { ok: true } and nothing else', async () => {
    app = await buildApp(testConfig());
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json())).toEqual({ ok: true });
    expect(Object.keys(res.json())).toEqual(['ok']);
  });
});

describe('security headers', () => {
  const expected = {
    'content-security-policy': CONTENT_SECURITY_POLICY,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
  };

  it('are set on successful responses', async () => {
    app = await buildApp(testConfig());
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers).toMatchObject(expected);
  });

  it('are set on 404 responses', async () => {
    app = await buildApp(testConfig());
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers).toMatchObject(expected);
    expect(ErrorBody.parse(res.json()).error.code).toBe('NOT_FOUND');
  });

  it('CSP allows only the app’s own origin', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-inline|unsafe-eval|https?:/);
  });
});
