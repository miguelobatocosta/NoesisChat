import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, type Config } from '../src/config';

export function tempDir(prefix = 'pausa-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** A config rooted in an empty temp dir, so the developer's real .env never leaks into tests. */
export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({ root: tempDir(), env: { NODE_ENV: 'test', ...env } });
}

/** Writes a fake web build and returns its path. */
export function fakeWebBuild(): string {
  const dir = tempDir('pausa-web-');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><title>shell</title><div id="root"></div>',
  );
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log("app")');
  return dir;
}
