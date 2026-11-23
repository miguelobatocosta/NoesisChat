import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { E2E_DATA, E2E_PORT } from '../playwright.config';

const SERVER_DIST = fileURLToPath(new URL('../../server/dist/', import.meta.url));

/** Runs one of the server's bundled CLIs against the E2E data dir (SQLite WAL allows a second process). */
export function cli(name: 'init' | 'invite' | 'seed', args: string[] = []): string {
  return execFileSync(process.execPath, [`${SERVER_DIST}${name}.js`, ...args], {
    env: { ...process.env, DATA_DIR: E2E_DATA, PORT: String(E2E_PORT), NODE_ENV: 'test' },
    encoding: 'utf8',
  });
}

export function memberInvite(name?: string): string {
  const out = cli('invite', [...(name ? ['--name', name] : []), '--json']);
  return (JSON.parse(out) as { link: string }).link;
}

/** A link that signs in as the host (creates the host on first use). */
export function hostLink(): string {
  const match = /http\S+\/join#\S+/.exec(cli('init', ['--name', 'Costa']));
  if (!match) throw new Error('no host link printed');
  return match[0];
}

let counter = 0;
export const uniqueName = (base: string) =>
  `${base} ${Date.now().toString(36).slice(-4)}${++counter}`;

/** Collects console errors, page errors and failed responses. CSP violations surface as console errors. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('response', (res) => res.status() >= 400 && errors.push(`${res.status()} ${res.url()}`));
  return errors;
}

export interface Person {
  context: BrowserContext;
  page: Page;
  name: string;
  errors: string[];
}

/** Opens a fresh browser profile and joins through the real invite page. */
export async function join(
  browser: Browser,
  link: string,
  name: string,
  opts: { colorScheme?: 'light' | 'dark'; trackSockets?: boolean } = {},
): Promise<Person> {
  const context = await browser.newContext({
    colorScheme: opts.colorScheme ?? 'light',
    locale: 'pt-PT',
  });
  if (opts.trackSockets) {
    // Keep a handle on every WebSocket so a test can cut the connection (emulated offline mode doesn't).
    await context.addInitScript(() => {
      const Native = window.WebSocket;
      const open: WebSocket[] = [];
      (window as unknown as { __sockets: WebSocket[] }).__sockets = open;
      window.WebSocket = class extends Native {
        constructor(...args: ConstructorParameters<typeof WebSocket>) {
          super(...args);
          open.push(this);
        }
      } as typeof WebSocket;
    });
  }
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(link);
  await page.getByLabel('Como te chamamos?').fill(name);
  await page.getByLabel('Li as regras e a nota de privacidade').check();
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'geral', exact: true })).toBeVisible();
  return { context, page, name, errors };
}

export const composer = (page: Page) => page.getByRole('textbox', { name: /^Escreve para/ });

export async function send(page: Page, text: string): Promise<void> {
  await composer(page).fill(text);
  await composer(page).press('Enter');
}

export const message = (page: Page, text: string | RegExp) =>
  page.locator('article', { hasText: text }).last();

/** A message containing the text in its own body, not merely quoting it in a reply. */
export const original = (page: Page, text: string | RegExp) =>
  page
    .locator('article', { hasText: text })
    .filter({ hasNot: page.getByRole('button', { name: 'Ver mensagem original' }) })
    .last();

/** Cuts the realtime connection and refuses new ones until goOnline(). */
export async function goOffline(person: Person): Promise<void> {
  await person.context.routeWebSocket(/\/socket\.io\//, (ws) => ws.close());
  await person.context.route(/\/socket\.io\//, (route) => route.abort());
  await person.page.evaluate(() =>
    (window as unknown as { __sockets: WebSocket[] }).__sockets.forEach((s) => s.close()),
  );
}

export async function goOnline(person: Person): Promise<void> {
  await person.context.unrouteAll({ behavior: 'ignoreErrors' });
}
