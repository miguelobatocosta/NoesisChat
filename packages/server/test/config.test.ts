import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config';
import { tempDir } from './helpers';

describe('loadConfig', () => {
  it('has safe defaults: production, localhost only, data dir under the root', () => {
    const root = tempDir();
    const c = loadConfig({ root, env: {} });
    expect(c.env).toBe('production');
    expect(c.port).toBe(4747);
    expect(c.bind).toBe('127.0.0.1');
    expect(c.dataDir).toBe(resolve(root, 'data'));
    expect(c.webDist).toBe(resolve(root, 'packages/web/dist'));
    expect(c.publicUrl).toBeUndefined();
    expect(c.publicOrigin).toBeUndefined();
    expect(c.uploadMaxBytes).toBe(10 * 1024 * 1024);
  });

  it('reads environment variables and coerces numbers', () => {
    const c = loadConfig({
      root: tempDir(),
      env: { PORT: '5000', UPLOAD_MAX_MB: '25', BIND: '0.0.0.0' },
    });
    expect(c.port).toBe(5000);
    expect(c.uploadMaxBytes).toBe(25 * 1024 * 1024);
    expect(c.bind).toBe('0.0.0.0');
  });

  it('derives the public origin from PUBLIC_URL', () => {
    const c = loadConfig({
      root: tempDir(),
      env: { PUBLIC_URL: 'https://abc.trycloudflare.com/some/path' },
    });
    expect(c.publicOrigin).toBe('https://abc.trycloudflare.com');
  });

  it('applies precedence env > .env > pausa.config.json > defaults', () => {
    const root = tempDir();
    writeFileSync(
      join(root, 'pausa.config.json'),
      JSON.stringify({ PORT: 1111, UPLOAD_MAX_MB: 3, BIND: '::1' }),
    );
    writeFileSync(join(root, '.env'), 'PORT=2222\nUPLOAD_MAX_MB=4\n');
    const c = loadConfig({ root, env: { PORT: '3333' } });
    expect(c.port).toBe(3333); // env
    expect(c.uploadMaxBytes).toBe(4 * 1024 * 1024); // .env
    expect(c.bind).toBe('::1'); // json
  });

  it('honours PAUSA_CONFIG for the JSON file location', () => {
    const root = tempDir();
    writeFileSync(join(root, 'custom.json'), JSON.stringify({ PORT: 4321 }));
    expect(loadConfig({ root, env: { PAUSA_CONFIG: 'custom.json' } }).port).toBe(4321);
  });

  it('keeps absolute DATA_DIR as-is and resolves relative ones against the root', () => {
    const root = tempDir();
    const abs = tempDir();
    expect(loadConfig({ root, env: { DATA_DIR: abs } }).dataDir).toBe(abs);
    expect(loadConfig({ root, env: { DATA_DIR: 'x/y' } }).dataDir).toBe(resolve(root, 'x/y'));
  });

  it('ignores unknown keys and empty values', () => {
    const c = loadConfig({ root: tempDir(), env: { SOMETHING_ELSE: 'x', PORT: '' } });
    expect(c.port).toBe(4747);
  });

  it.each([
    [{ PORT: 'abc' }, 'PORT'],
    [{ PORT: '70000' }, 'PORT'],
    [{ BIND: 'my-laptop' }, 'BIND'],
    [{ PUBLIC_URL: 'ftp://example.com' }, 'PUBLIC_URL'],
    [{ PUBLIC_URL: 'not a url' }, 'PUBLIC_URL'],
    [{ NODE_ENV: 'staging' }, 'NODE_ENV'],
    [{ UPLOAD_MAX_MB: '0' }, 'UPLOAD_MAX_MB'],
  ])('rejects invalid values with a readable error: %o', (env, key) => {
    expect(() => loadConfig({ root: tempDir(), env })).toThrow(ConfigError);
    expect(() => loadConfig({ root: tempDir(), env })).toThrow(key);
  });

  it('rejects a malformed JSON config file', () => {
    const root = tempDir();
    writeFileSync(join(root, 'pausa.config.json'), '{ nope');
    expect(() => loadConfig({ root, env: {} })).toThrow(ConfigError);
  });

  it('rejects a JSON config that is not an object', () => {
    const root = tempDir();
    writeFileSync(join(root, 'pausa.config.json'), '[1,2]');
    expect(() => loadConfig({ root, env: {} })).toThrow('must contain a JSON object');
  });
});
