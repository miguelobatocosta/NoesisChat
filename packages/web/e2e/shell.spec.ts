import { expect, test } from '@playwright/test';
import { APP_NAME, BRAND_WORDMARK } from '@pausa/shared';
import { watchErrors } from './helpers';

test('without a session: branded "you need an invite" page, no foreign requests, no errors', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol.startsWith('http') && url.origin !== origin) foreign.push(req.url());
  });
  const errors = watchErrors(page);

  await page.goto('/');
  const header = page.getByRole('banner');
  await expect(header).toContainText(BRAND_WORDMARK);
  await expect(header).toContainText(APP_NAME);
  await expect(page).toHaveTitle(APP_NAME);
  await expect(page.getByRole('heading', { name: 'Precisas de um convite' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

test('a join link without a valid code says so', async ({ page }) => {
  await page.goto('/join#nope');
  await expect(page.getByText('Este link não trouxe o convite')).toBeVisible();
});

test('Raleway comes from the bundle and is used', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      loaded: [...document.fonts].some(
        (f) => f.family.includes('Raleway') && f.status === 'loaded',
      ),
      bodyFont: getComputedStyle(document.body).fontFamily,
    };
  });
  expect(result.bodyFont).toContain('Raleway');
  expect(result.loaded).toBe(true);
});

test('theme follows the OS, the override sticks across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByRole('radio', { name: 'Escuro' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: 'Sistema' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('server paths never get the app shell, and carry the CSP', async ({ request }) => {
  const api = await request.get('/api/does-not-exist');
  expect(api.status()).toBe(404);
  expect(api.headers()['content-security-policy']).toContain("default-src 'self'");
  const files = await request.get('/files/01JA0000000000000000000000');
  expect(files.status()).toBe(401);
});

test('installable: manifest with name and icons is served', async ({ request, page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  const res = await request.get(href!);
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as {
    name: string;
    display: string;
    icons: { src: string; sizes: string }[];
  };
  expect(manifest).toMatchObject({ name: APP_NAME, display: 'standalone' });
  expect(manifest.icons.map((i) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
  for (const icon of manifest.icons)
    expect((await request.get(icon.src)).headers()['content-type']).toBe('image/png');
});
