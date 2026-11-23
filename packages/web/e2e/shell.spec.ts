import { expect, test, type Page } from '@playwright/test';
import { APP_NAME, BRAND_WORDMARK } from '@pausa/shared';

/** Collects console errors and page errors. CSP violations show up here as "Refused to …". */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('response', (res) => res.status() >= 400 && errors.push(`${res.status()} ${res.url()}`));
  return errors;
}

test('serves the branded shell with zero requests to other hosts and no errors', async ({
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
  await expect(header).toBeVisible();
  await expect(header).toContainText(BRAND_WORDMARK);
  await expect(header).toContainText(APP_NAME);
  await expect(page).toHaveTitle(APP_NAME);
  await page.waitForLoadState('networkidle');

  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

test('Raleway comes from the bundle and is actually used', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [...document.fonts].filter(
      (f) => f.family.includes('Raleway') && f.status === 'loaded',
    );
    return {
      loadedWeights: loaded.map((f) => f.weight),
      bodyFont: getComputedStyle(document.body).fontFamily,
    };
  });
  expect(result.bodyFont).toContain('Raleway');
  expect(result.loadedWeights.length).toBeGreaterThan(0);
});

test('follows the OS theme by default', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Sistema' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('theme override applies immediately and survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.getByRole('radio', { name: 'Escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('radio', { name: 'Sistema' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('client-side routes get the app shell, server paths do not', async ({ request }) => {
  const route = await request.get('/join');
  expect(route.status()).toBe(200);
  expect(await route.text()).toContain('id="root"');

  const api = await request.get('/api/does-not-exist');
  expect(api.status()).toBe(404);
  expect(api.headers()['content-security-policy']).toContain("default-src 'self'");
});
