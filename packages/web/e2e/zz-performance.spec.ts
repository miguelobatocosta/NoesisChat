// Runs last (file order): seeds 5,000 messages into a separate room.
import { expect, test } from '@playwright/test';
import { cli, join, memberInvite, uniqueName } from './helpers';

test('5,000 messages: only a window is rendered, and scrolling back loads older pages', async ({
  browser,
}) => {
  cli('seed', ['--count', '5000', '--room', 'carga']);
  const ana = await join(browser, memberInvite(), uniqueName('Ana'));
  await ana.page.goto('/r/carga');
  await expect(ana.page.getByText('Mensagem de teste n.º 5000')).toBeVisible();

  const scroller = ana.page.locator('[data-virtuoso-scroller="true"]');
  const rendered = () => ana.page.locator('article').count();
  expect(await rendered()).toBeLessThan(80);

  const started = Date.now();
  for (let i = 0; i < 6; i++) {
    await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
    await ana.page.waitForTimeout(250);
  }
  await expect(ana.page.getByText(/Mensagem de teste n\.º 4[0-9]{3}$/).first()).toBeVisible();
  expect(await rendered()).toBeLessThan(120); // still virtualized after loading several pages
  expect(Date.now() - started).toBeLessThan(10_000);
  expect(ana.errors).toEqual([]);
  await ana.context.close();
});
