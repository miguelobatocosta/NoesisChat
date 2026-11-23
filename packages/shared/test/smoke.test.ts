import { describe, expect, it } from 'vitest';
import { APP_NAME, BRAND_WORDMARK, DEFAULT_PORT, ErrorBody, HealthResponse } from '../src/index';

describe('shared', () => {
  it('exposes the app constants', () => {
    expect(APP_NAME).toBe('Pausa');
    expect(BRAND_WORDMARK).toBe('NOESIS');
    expect(DEFAULT_PORT).toBe(4747);
  });

  it('validates the health response strictly', () => {
    expect(HealthResponse.parse({ ok: true })).toEqual({ ok: true });
    expect(HealthResponse.safeParse({ ok: false }).success).toBe(false);
  });

  it('validates the error body shape', () => {
    const body = { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } };
    expect(ErrorBody.parse(body)).toEqual(body);
    expect(ErrorBody.safeParse({ ok: false, error: 'nope' }).success).toBe(false);
  });
});
