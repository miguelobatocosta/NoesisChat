import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  composer,
  goOffline,
  goOnline,
  hostLink,
  join,
  memberInvite,
  message,
  original,
  send,
  uniqueName,
} from './helpers';

test.describe('joining', () => {
  test('invite link → rules → name → #geral; the code leaves the address bar; reload keeps the session', async ({
    browser,
  }) => {
    const name = uniqueName('Marta');
    const ana = await join(browser, memberInvite(), name);
    expect(new URL(ana.page.url()).hash).toBe('');
    await ana.page.reload();
    await expect(ana.page.getByRole('heading', { name: 'geral', exact: true })).toBeVisible();
    await expect(ana.page.getByText(name).first()).toBeVisible();
    expect(ana.errors).toEqual([]);
    await ana.context.close();
  });

  test('an invite made for a name keeps that name; a used invite is refused', async ({
    browser,
  }) => {
    const intended = uniqueName('Joana');
    const link = memberInvite(intended);
    const joana = await join(browser, link, 'outro nome qualquer');
    await expect(joana.page.locator('nav').getByText(intended).first()).toBeVisible();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(link);
    await page.getByLabel('Como te chamamos?').fill('Intruso');
    await page.getByLabel('Li as regras e a nota de privacidade').check();
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toContainText('não é válido');
    await ctx.close();
    await joana.context.close();
  });
});

test.describe('two people chatting', () => {
  test('send, receive, mention, reply jump, react, edit with ↑, delete', async ({ browser }) => {
    const anaName = uniqueName('Ana');
    const ruiName = uniqueName('Rui');
    const ana = await join(browser, memberInvite(), anaName);
    const rui = await join(browser, memberInvite(), ruiName);

    await send(ana.page, 'Bom dia! **Almoço** sexta? https://example.com');
    const received = original(rui.page, 'Almoço');
    await expect(received).toBeVisible();
    await expect(received.locator('strong')).toHaveText('Almoço');
    await expect(received.getByRole('link', { name: 'https://example.com' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );

    // Mention via autocomplete: highlighted for Ana.
    await composer(rui.page).fill(`Conta comigo @${anaName.split(' ')[0]}`);
    await rui.page.getByRole('option', { name: anaName }).click();
    await composer(rui.page).pressSequentially('🍕');
    await composer(rui.page).press('Enter');
    const mention = message(ana.page, 'Conta comigo');
    await expect(mention).toHaveAttribute('data-mention', 'true');
    await expect(mention.locator('.mention-me')).toHaveText(`@${anaName}`);

    // Reply, then jump to the original from the quote.
    await received.hover();
    await received.getByRole('button', { name: 'Responder' }).click();
    await expect(rui.page.getByText(`A responder a ${anaName}`)).toBeVisible();
    await send(rui.page, 'Onde?');
    const reply = message(ana.page, 'Onde?');
    await expect(reply.getByRole('button', { name: 'Ver mensagem original' })).toContainText(
      'Almoço',
    );
    await reply.getByRole('button', { name: 'Ver mensagem original' }).click();
    await expect(original(ana.page, 'Bom dia!')).toHaveAttribute('data-highlight', 'true');

    // React from Rui's side; Ana sees the count and who.
    await received.hover();
    await received.getByRole('button', { name: 'Reagir 👍' }).click();
    await expect(
      original(ana.page, 'Bom dia!').getByRole('button', { name: `${ruiName} reagiu com 👍` }),
    ).toContainText('1');

    // Edit my last message with ↑.
    await composer(ana.page).click();
    await composer(ana.page).press('ArrowUp');
    await expect(ana.page.getByText('A editar a mensagem')).toBeVisible();
    await composer(ana.page).fill('Bom dia! **Almoço** quinta, afinal');
    await composer(ana.page).press('Enter');
    await expect(message(rui.page, 'quinta, afinal')).toContainText('(editada)');

    // Delete with confirmation.
    const toDelete = message(ana.page, 'quinta, afinal');
    await toDelete.hover();
    await toDelete.getByRole('button', { name: 'Apagar' }).click();
    await ana.page
      .getByRole('dialog', { name: 'Apagar esta mensagem?' })
      .getByRole('button', { name: 'Apagar' })
      .click();
    await expect(rui.page.getByText('mensagem apagada').first()).toBeVisible();
    await expect(rui.page.getByText('quinta, afinal')).toHaveCount(0);

    expect(ana.errors).toEqual([]);
    expect(rui.errors).toEqual([]);
    await ana.context.close();
    await rui.context.close();
  });

  test('a new room appears live; unread badge counts and clears', async ({ browser }) => {
    const ana = await join(browser, memberInvite(), uniqueName('Ana'));
    const rui = await join(browser, memberInvite(), uniqueName('Rui'));
    const roomName = `futebol ${Date.now().toString(36).slice(-4)}`;

    await ana.page.getByRole('button', { name: 'Nova sala' }).click();
    const dialog = ana.page.getByRole('dialog', { name: 'Nova sala' });
    await dialog.getByLabel('Nome').fill(roomName);
    await dialog.getByRole('button', { name: 'Criar sala' }).click();
    await expect(ana.page.getByRole('heading', { name: roomName })).toBeVisible();
    await expect(ana.page).toHaveURL(/\/r\/futebol-/);

    const ruiRoom = rui.page
      .locator('nav')
      .getByRole('button', { name: new RegExp(`^${roomName}`) });
    await expect(ruiRoom).toBeVisible();

    // The room's mascot introduces itself first (D-49), so that's one more unread.
    await expect(ana.page.getByRole('article').first()).toBeVisible();
    await send(ana.page, 'golo!');
    await send(ana.page, 'outro golo!');
    await expect(ruiRoom).toHaveAccessibleName(`${roomName}, 3 por ler`);
    await expect(rui.page).toHaveTitle(/^\(3\) /);

    await ruiRoom.click();
    await expect(message(rui.page, 'outro golo!')).toBeVisible();
    await expect(ruiRoom).toHaveAccessibleName(roomName);

    await ana.context.close();
    await rui.context.close();
  });

  test('offline: a message written while disconnected is delivered once on reconnect', async ({
    browser,
  }) => {
    const ana = await join(browser, memberInvite(), uniqueName('Ana'), { trackSockets: true });
    const rui = await join(browser, memberInvite(), uniqueName('Rui'));
    const text = `escrito offline ${Date.now()}`;
    const missed = `enquanto estavas fora ${Date.now()}`;

    await goOffline(ana);
    await expect(ana.page.getByRole('status').filter({ hasText: /ligar/ })).toBeVisible({
      timeout: 15_000,
    });
    await send(ana.page, text);
    await expect(message(ana.page, text)).toContainText('a enviar…');
    await send(rui.page, missed);

    await goOnline(ana);
    await expect(message(ana.page, missed)).toBeVisible({ timeout: 30_000 }); // caught up via messages:sync
    await expect(message(rui.page, text)).toBeVisible({ timeout: 30_000 });
    await expect(message(ana.page, text)).not.toContainText('a enviar…');
    await expect(rui.page.locator('article', { hasText: text })).toHaveCount(1);

    await ana.context.close();
    await rui.context.close();
  });

  test('a mention while the window is unfocused fires a notification', async ({ browser }) => {
    const anaName = uniqueName('Ana');
    const ana = await join(browser, memberInvite(), anaName);
    const rui = await join(browser, memberInvite(), uniqueName('Rui'));

    await ana.page.evaluate(() => {
      const shown: { title: string; body: string }[] = [];
      (window as unknown as { __shown: typeof shown }).__shown = shown;
      class FakeNotification {
        static permission = 'granted';
        static requestPermission = () => Promise.resolve('granted');
        onclick: (() => void) | null = null;
        constructor(title: string, opts: { body: string }) {
          shown.push({ title, body: opts.body });
        }
        close() {}
      }
      (window as unknown as { Notification: unknown }).Notification = FakeNotification;
      window.dispatchEvent(new Event('blur'));
    });

    await send(rui.page, 'sem menção, não notifica');
    await composer(rui.page).fill(`@${anaName} vens?`);
    await composer(rui.page).press('Escape');
    await composer(rui.page).press('Enter');
    await expect(message(ana.page, 'vens?')).toBeVisible();

    const shown = await ana.page.evaluate(
      () => (window as unknown as { __shown: { title: string; body: string }[] }).__shown,
    );
    expect(shown).toHaveLength(1);
    expect(shown[0]!.title).toContain('#geral');
    expect(shown[0]!.body).toBe(`@${anaName} vens?`);

    await ana.context.close();
    await rui.context.close();
  });
});

test.describe('mascots', () => {
  test('call Dona Lurdes by name in #geral and she answers as a reply; new rooms get a mascot', async ({
    browser,
  }) => {
    const ana = await join(browser, memberInvite(), uniqueName('Ana'));
    await expect(ana.page.getByRole('heading', { name: 'geral' })).toBeVisible();

    const text = `Dona Lurdes, já sabe a novidade ${Date.now().toString(36)}?`;
    await send(ana.page, text);
    const answer = ana.page
      .getByRole('article', { name: 'Dona Lurdes' })
      .filter({ has: ana.page.getByRole('button', { name: 'Ver mensagem original' }) })
      .filter({ hasText: text.slice(0, 40) });
    await expect(answer).toBeVisible();
    await expect(answer.getByText('mascote', { exact: true })).toBeVisible();

    await ana.page.getByRole('button', { name: 'Nova sala' }).click();
    const dialog = ana.page.getByRole('dialog', { name: 'Nova sala' });
    await dialog.getByLabel('Nome').fill(`petiscos ${Date.now().toString(36).slice(-4)}`);
    await dialog.getByRole('button', { name: 'Criar sala' }).click();
    await expect(
      ana.page.getByRole('article', { name: /Bolacha|Faísca|Sr\. Ferreira|Pixel|Nuvem/ }),
    ).toBeVisible();

    expect(ana.errors).toEqual([]);
    await ana.context.close();
  });
});

test.describe('images', () => {
  test('a phone JPEG is stripped of GPS before upload and opens in the lightbox', async ({
    browser,
  }) => {
    const ana = await join(browser, memberInvite(), uniqueName('Ana'));
    const rui = await join(browser, memberInvite(), uniqueName('Rui'));

    await ana.page
      .locator('input[type=file]')
      // fileURLToPath, not URL.pathname: on Windows .pathname is '/C:/...', not a usable path.
      .setInputFiles(fileURLToPath(new URL('./fixtures/gps.jpg', import.meta.url)));
    await expect(ana.page.getByRole('button', { name: 'Enviar' })).toBeEnabled();
    await send(ana.page, 'a vista daqui');

    const img = message(rui.page, 'a vista daqui').getByRole('img');
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(240);

    const src = await img.getAttribute('src');
    const res = await rui.page.request.get(src!);
    expect(res.status()).toBe(200);
    const bytes = await res.body();
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
    expect(bytes.includes(Buffer.from('Exif\0\0'))).toBe(false); // no EXIF block, so no GPS

    await img.click();
    await expect(rui.page.getByRole('dialog').getByRole('img')).toBeVisible();
    await rui.page.keyboard.press('Escape');

    await ana.context.close();
    await rui.context.close();
  });
});

test.describe('admin', () => {
  test('host creates an invite in the panel, a colleague joins with it, the host revokes them', async ({
    browser,
  }) => {
    const host = await join(browser, hostLink(), 'Costa');
    await host.page.getByRole('button', { name: 'Menu' }).click();
    await host.page.getByRole('menuitem', { name: 'Administração' }).click();
    const panel = host.page.getByRole('dialog', { name: 'Administração' });
    const guest = uniqueName('Convidada');
    await panel.getByLabel('Nome da pessoa (opcional)').fill(guest);
    await panel.getByRole('button', { name: 'Criar convite' }).click();
    const link = await panel.getByLabel('Link de convite, uso único:').inputValue();
    expect(link).toMatch(/\/join#[A-Za-z0-9_-]{22}$/);

    const colleague = await join(browser, link, 'ignorado');
    await expect(colleague.page.locator('nav').getByText(guest).first()).toBeVisible();

    await panel.getByRole('tab', { name: 'Membros' }).click();
    const row = panel.getByRole('listitem').filter({ hasText: guest });
    await row.getByRole('button', { name: 'Retirar acesso' }).click();
    await host.page
      .getByRole('dialog', { name: `Retirar o acesso a ${guest}?` })
      .getByRole('button', { name: 'Retirar acesso' })
      .click();

    await expect(
      colleague.page.getByRole('heading', { name: 'A tua sessão terminou' }),
    ).toBeVisible({ timeout: 5000 });

    await panel.getByRole('tab', { name: 'Registo' }).click();
    await expect(panel.getByText(`retirou o acesso a ${guest}`)).toBeVisible();

    await host.context.close();
    await colleague.context.close();
  });
});

test.describe('cakes (D-53)', () => {
  test('a milestone is recorded, the debtor confirms it from the chat card, promises a day, and the host marks it paid', async ({
    browser,
  }) => {
    const anaName = uniqueName('Ana');
    const ana = await join(browser, memberInvite(), anaName);
    const host = await join(browser, hostLink(), 'Costa');

    // Host records Ana's milestone on the Bolos page.
    await host.page
      .locator('nav')
      .getByRole('button', { name: /^Bolos/ })
      .click();
    await expect(host.page.getByRole('heading', { name: 'Bolos', exact: true })).toBeVisible();
    await expect(host.page).toHaveURL(/\/bolos$/);
    const form = host.page.getByRole('region', { name: 'Registar marco' });
    await form.getByLabel('Quem').selectOption({ label: anaName });
    await form.getByLabel('Motivo').selectOption({ label: 'Casa nova' });
    await form.getByRole('button', { name: 'Registar' }).click();

    // Ana sees the mascot's card in #geral and confirms it herself.
    const card = message(ana.page, /Casa nova/).filter({
      has: ana.page.getByRole('button', { name: 'Confirmo' }),
    });
    await card.getByRole('button', { name: 'Confirmo' }).click();
    await expect(
      ana.page
        .locator('article', { hasText: /Casa nova/ })
        .filter({ has: ana.page.getByRole('button', { name: 'Ver bolos' }) })
        .first()
        .getByText('em dívida'),
    ).toBeVisible();

    // She promises it for a day.
    await ana.page
      .locator('nav')
      .getByRole('button', { name: /^Bolos/ })
      .click();
    const owed = ana.page
      .getByRole('region', { name: 'Quem deve' })
      .getByRole('listitem')
      .filter({ hasText: anaName })
      .first();
    await owed.getByRole('button', { name: 'Levo eu' }).click();
    await owed.getByRole('button', { name: 'Prometo' }).click();
    await expect(owed.getByText(/leva dia/)).toBeVisible();

    // Someone else confirms the cake arrived.
    const hostRow = host.page
      .getByRole('region', { name: 'Quem deve' })
      .getByRole('listitem')
      .filter({ hasText: anaName })
      .first();
    await hostRow.getByRole('button', { name: 'Trouxe ✔' }).click();
    await expect(
      host.page.getByRole('region', { name: 'Bolos pagos' }).getByText(anaName).first(),
    ).toBeVisible();

    expect(ana.errors).toEqual([]);
    expect(host.errors).toEqual([]);
    await ana.context.close();
    await host.context.close();
  });
});

test.describe('do not disturb', () => {
  test('one hour of silence shows in the sidebar and survives a reload; switching off clears it', async ({
    browser,
  }) => {
    const ana = await join(browser, memberInvite(), uniqueName('Ana'));
    await ana.page.getByRole('button', { name: 'Menu' }).click();
    await ana.page.getByRole('menuitem', { name: 'Não incomodar' }).click();
    const dialog = ana.page.getByRole('dialog', { name: 'Não incomodar' });
    await dialog.getByRole('button', { name: '1 hora' }).click();
    await ana.page.keyboard.press('Escape');

    const note = ana.page.locator('nav').getByText(/^Em silêncio até às \d\d:\d\d$/);
    await expect(note).toBeVisible();
    await ana.page.reload();
    await expect(note).toBeVisible();

    await ana.page.getByRole('button', { name: 'Menu' }).click();
    await ana.page.getByRole('menuitem', { name: 'Não incomodar' }).click();
    await ana.page
      .getByRole('dialog', { name: 'Não incomodar' })
      .getByRole('button', { name: 'Desligar' })
      .click();
    await expect(note).toBeHidden();
    expect(ana.errors).toEqual([]);
    await ana.context.close();
  });
});

test.describe('search', () => {
  test('finds a message in another room ignoring accents, and jumps to it', async ({ browser }) => {
    const ana = await join(browser, memberInvite(), uniqueName('Ana'));
    const word = `pastelaria${Date.now().toString(36)}`;
    const roomName = `procura ${Date.now().toString(36).slice(-4)}`;
    await ana.page.getByRole('button', { name: 'Nova sala' }).click();
    const create = ana.page.getByRole('dialog', { name: 'Nova sala' });
    await create.getByLabel('Nome').fill(roomName);
    await create.getByRole('button', { name: 'Criar sala' }).click();
    await expect(ana.page.getByRole('heading', { name: roomName })).toBeVisible();
    await send(ana.page, `a melhor ${word} é a da esquina, café incluído`);
    await expect(message(ana.page, word)).toBeVisible();

    await ana.page
      .locator('nav')
      .getByRole('button', { name: /^geral/ })
      .click();
    await expect(ana.page.getByRole('heading', { name: 'geral', exact: true })).toBeVisible();

    await ana.page.keyboard.press('Control+Shift+F');
    const dialog = ana.page.getByRole('dialog', { name: 'Pesquisar mensagens' });
    await dialog.getByLabel('O que procuras?').fill(`${word} cafe`);
    const result = dialog.getByRole('button', { name: new RegExp(word) });
    await expect(result).toBeVisible();
    await result.click();

    await expect(ana.page.getByRole('heading', { name: roomName })).toBeVisible();
    await expect(message(ana.page, word)).toHaveAttribute('data-highlight', 'true');
    expect(ana.errors).toEqual([]);
    await ana.context.close();
  });
});

test.describe('moderation (D-51)', () => {
  test('a mascot labels and mutes someone who keeps talking about one topic; the host lifts it', async ({
    browser,
  }) => {
    const host = await join(browser, hostLink(), 'Costa');
    const roomName = `sesta ${Date.now().toString(36).slice(-4)}`;
    await host.page.getByRole('button', { name: 'Nova sala' }).click();
    const create = host.page.getByRole('dialog', { name: 'Nova sala' });
    await create.getByLabel('Nome').fill(roomName);
    await create.getByRole('button', { name: 'Criar sala' }).click();

    // Small thresholds on "Sono" so two messages are enough.
    await host.page.getByRole('button', { name: 'Menu' }).click();
    await host.page.getByRole('menuitem', { name: 'Administração' }).click();
    const panel = host.page.getByRole('dialog', { name: 'Administração' });
    await panel.getByRole('tab', { name: 'Tópicos' }).click();
    const sono = panel.getByRole('listitem').filter({ hasText: 'zombie' });
    await sono.getByRole('button', { name: 'Editar' }).click();
    await sono.getByLabel('Rótulo aos').fill('1');
    await sono.getByLabel('Castigo aos').fill('2');
    await sono.getByRole('button', { name: 'Guardar' }).click();
    await expect(sono.getByText(/rótulo aos 1 · castigo aos 2/)).toBeVisible();
    await host.page.keyboard.press('Escape');

    const ana = await join(browser, memberInvite(), uniqueName('Ana'));
    await ana.page
      .locator('nav')
      .getByRole('button', { name: new RegExp(`^${roomName}`) })
      .click();
    await expect(ana.page.getByRole('heading', { name: roomName })).toBeVisible();

    await send(ana.page, 'hoje tenho olheiras');
    await expect(message(ana.page, 'hoje tenho olheiras').getByText('zombie')).toBeVisible();
    await expect(message(host.page, 'hoje tenho olheiras').getByText('zombie')).toBeVisible();

    await send(ana.page, 'mesmo muitas olheiras');
    // Muted: the composer is disabled and says why (its name changes with it).
    await expect(ana.page.getByRole('textbox', { name: /^De castigo até às/ })).toBeDisabled();

    await host.page.getByRole('button', { name: 'Menu' }).click();
    await host.page.getByRole('menuitem', { name: 'Administração' }).click();
    await panel.getByRole('tab', { name: 'Castigos' }).click();
    await panel
      .getByRole('listitem')
      .filter({ hasText: ana.name })
      .getByRole('button', { name: 'Levantar' })
      .first()
      .click();
    await expect(ana.page.getByRole('textbox', { name: /^Escreve para/ })).toBeEnabled();

    expect(ana.errors).toEqual([]);
    await host.context.close();
    await ana.context.close();
  });
});

test.describe('accessibility and brand', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`no contrast failures in the chat (${scheme})`, async ({ browser }) => {
      const ana = await join(browser, memberInvite(), uniqueName('Ana'), { colorScheme: scheme });
      await send(ana.page, 'Contraste **ok**? `código` https://example.com');
      await expect(message(ana.page, 'Contraste')).toBeVisible();
      const results = await new AxeBuilder({ page: ana.page })
        .withRules(['color-contrast'])
        .analyze();
      expect(results.violations.map((v) => v.nodes.map((n) => n.target.join(' ')))).toEqual([]);
      await ana.context.close();
    });
  }
});
