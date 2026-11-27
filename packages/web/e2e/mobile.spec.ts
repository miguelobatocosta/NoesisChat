import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { composer, memberInvite, message, send, uniqueName, watchErrors } from './helpers';

// A typical phone (D-22): the sidebar is a drawer, nothing scrolls sideways.
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  locale: 'pt-PT',
});

test('phone: rooms drawer, sending, no sideways scroll, no contrast failures', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(memberInvite());
  await page.getByLabel('Como te chamamos?').fill(uniqueName('Telemóvel'));
  await page.getByLabel('Li as regras e a nota de privacidade').check();
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'geral', exact: true })).toBeVisible();

  // The drawer starts closed; the header's "Salas" button pulls it out.
  const nav = page.getByRole('navigation', { name: 'Salas' });
  await expect(nav).toBeHidden();
  await page.getByRole('button', { name: 'Salas' }).click();
  await expect(nav).toBeVisible();

  // Make a room from the drawer; picking it closes the drawer.
  await nav.getByRole('button', { name: 'Nova sala' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova sala' });
  const roomName = `bolso ${Date.now().toString(36).slice(-4)}`;
  await dialog.getByLabel('Nome').fill(roomName);
  await dialog.getByRole('button', { name: 'Criar sala' }).click();
  await expect(page.getByRole('heading', { name: roomName })).toBeVisible();
  await expect(nav).toBeHidden();

  await send(page, 'escrito no telemóvel');
  await expect(message(page, 'escrito no telemóvel')).toBeVisible();
  await expect(composer(page)).toHaveValue('');

  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(sideways).toBeLessThanOrEqual(0);

  const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  expect(axe.violations).toEqual([]);

  // Esc and tapping outside both close the drawer.
  await page.getByRole('button', { name: 'Salas' }).click();
  await expect(nav).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();

  expect(errors).toEqual([]);
});
