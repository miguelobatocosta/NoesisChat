// Automates the parts of the BRAND.md §8 checklist that can be checked without a browser.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const TOKENS = join(SRC, 'styles', 'tokens.css');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('no raw colours outside tokens.css', () => {
  const files = walk(SRC).filter((f) => /\.(css|tsx?|json)$/.test(f) && f !== TOKENS);

  it.each(files.map((f) => [relative(SRC, f), f]))('%s', (_name, file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(text).not.toMatch(/\b(rgba?|hsla?)\(/);
  });
});

// --- WCAG contrast on the token pairs components actually use -----------------------------------

function parseBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]!] = m[2]!.trim();
  return vars;
}

const css = readFileSync(TOKENS, 'utf8');
const light = parseBlock(css, ':root');
// tokens.css writes the selector with single quotes; accept either so the dark checks really run.
const darkSelector = /\[data-theme=(?:'dark'|"dark")\]/.exec(css)?.[0];
if (!darkSelector) throw new Error('dark theme block not found in tokens.css');
const dark = { ...light, ...parseBlock(css, darkSelector) };

function resolve(vars: Record<string, string>, name: string): string {
  let value = vars[name];
  for (let i = 0; value?.startsWith('var(') && i < 5; i++) value = vars[value.slice(4, -1).trim()];
  if (!value || !/^#[0-9a-fA-F]{6}$/.test(value))
    throw new Error(`${name} does not resolve to a hex colour`);
  return value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const TEXT_PAIRS: [fg: string, bg: string][] = [
  ['--fg', '--bg'],
  ['--fg-body', '--bg'],
  ['--fg-body', '--bg-subtle'],
  ['--fg-muted', '--bg'],
  ['--fg-muted', '--bg-subtle'],
  ['--link', '--bg'],
  ['--link', '--bg-selected'],
  ['--danger', '--bg'],
  ['--on-primary', '--primary'],
  ['--on-primary', '--primary-hover'],
  ['--primary', '--on-primary'],
  ['--on-accent', '--accent'],
  ['--sidebar-fg', '--sidebar-bg'],
  ['--sidebar-muted', '--sidebar-bg'],
  ['--sidebar-accent', '--sidebar-bg'],
  // Phase 20: the hero band and the paper objects on it.
  ['--hero-fg', '--hero-bg'],
  ['--hero-muted', '--hero-bg'],
  ['--hero-accent', '--hero-bg'],
  ['--hero-fg', '--hero-raised'],
  ['--hero-fg', '--hero-raised-hover'],
  ['--hero-muted', '--hero-raised'],
  ['--paper-fg', '--paper'],
  ['--paper-muted', '--paper'],
  ['--paper-ink', '--paper'],
  ['--hero-fg', '--paper-band'],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme contrast ≥ 4.5:1', (_theme, vars) => {
  it.each(TEXT_PAIRS)('%s on %s', (fg, bg) => {
    expect(contrast(resolve(vars, fg), resolve(vars, bg))).toBeGreaterThanOrEqual(4.5);
  });
});

it('mint is never a text colour on light backgrounds (BRAND.md §2)', () => {
  expect(contrast(resolve(light, '--accent'), resolve(light, '--bg'))).toBeLessThan(4.5);
  const offenders = walk(SRC)
    .filter((f) => f.endsWith('.css') && f !== TOKENS)
    .filter((f) => /(^|[^-])color:\s*var\(--(accent|n-mint)\)/m.test(readFileSync(f, 'utf8')));
  expect(offenders).toEqual([]);
});
