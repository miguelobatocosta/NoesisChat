import { afterEach, describe, expect, it } from 'vitest';
import { MASCOTS, type Message } from '@pausa/shared';
import { parseSheetDate } from '../src/community/dates';
import {
  call,
  collect,
  emit,
  sleep,
  startTestServer,
  type ClientSocket,
  type TestServer,
} from './harness';

let s: TestServer;
afterEach(async () => {
  await s?.close();
});

const ENV = { MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0' };
const state = (socket: ClientSocket) => call(socket, 'community:state', {});
const personOf = async (socket: ClientSocket, name: string) =>
  (await state(socket)).people.find((p) => p.name === name)!;
const mascotSaid = (events: { message: Message }[]) =>
  events.map((e) => e.message).filter((m) => MASCOTS.some((x) => x.userId === m.userId));

async function setup() {
  s = await startTestServer(ENV);
  const host = await s.connect(s.user('Costa', 'host'));
  const ana = await s.connect(s.user('Ana'));
  const rui = await s.connect(s.user('Rui'));
  return { host, ana, rui };
}

describe('people', () => {
  it('every member is a person; guests can be added and merged into a member later', async () => {
    const { host, ana } = await setup();
    expect((await state(ana)).people.map((p) => p.name).sort()).toEqual(['Ana', 'Costa', 'Rui']);

    await call(host, 'admin:people:addGuest', { name: 'Filomena' });
    const filomena = await personOf(host, 'Filomena');
    expect(filomena).toMatchObject({ userId: null, inTeam: true });
    await call(host, 'cakes:record', {
      personId: filomena.id,
      reason: 'Entrada Noesis',
      occurredOn: '2025-08-01',
    });
    await call(host, 'people:setBirthday', { personId: filomena.id, birthday: '04-05' });

    expect(await emit(ana, 'admin:people:addGuest', { name: 'Xavier' })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });

    const filUser = s.user('Filomena Silva');
    await call(host, 'admin:people:merge', { guestId: filomena.id, userId: filUser.id });
    const st = await state(host);
    const merged = st.people.find((p) => p.userId === filUser.id)!;
    expect(st.people.some((p) => p.id === filomena.id)).toBe(false);
    expect(merged.birthday).toBe('04-05');
    expect(st.debts.filter((d) => d.personId === merged.id)).toHaveLength(1);
  });

  it('anyone sets their own birthday; only admins set someone else’s', async () => {
    const { host, ana } = await setup();
    const me = await personOf(ana, 'Ana');
    const rui = await personOf(ana, 'Rui');
    await call(ana, 'people:setBirthday', { personId: me.id, birthday: '12-24' });
    expect(
      await emit(ana, 'people:setBirthday', { personId: rui.id, birthday: '01-01' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    await call(host, 'people:setBirthday', { personId: rui.id, birthday: '01-01' });
    expect((await personOf(host, 'Rui')).birthday).toBe('01-01');
  });
});

describe('milestones', () => {
  it('someone else’s milestone waits for a second person; the recorder can’t confirm it', async () => {
    const { ana, rui } = await setup();
    const events = collect(rui, 'message:new');
    const updates = collect(rui, 'community:updated');
    const target = await personOf(ana, 'Rui');

    await call(ana, 'cakes:record', {
      personId: target.id,
      reason: 'Casa nova',
      occurredOn: '2026-11-20',
    });
    await sleep(50);
    const [debt] = (await state(ana)).debts;
    expect(debt).toMatchObject({ status: 'pending', personId: target.id, kind: 'milestone' });
    expect(updates.length).toBeGreaterThan(0);
    const card = mascotSaid(events)[0]!;
    expect(card.card).toEqual({ type: 'milestone', ref: debt!.id });
    expect(card.mentions).toContain(target.userId); // Rui gets notified

    expect(await emit(ana, 'cakes:confirm', { debtId: debt!.id })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    await call(rui, 'cakes:confirm', { debtId: debt!.id }); // the debtor admits it
    expect((await state(ana)).debts[0]!.status).toBe('owed');
  });

  it('your own milestone counts right away; guests by name', async () => {
    const { ana } = await setup();
    const me = await personOf(ana, 'Ana');
    await call(ana, 'cakes:record', {
      personId: me.id,
      reason: 'Pai first time',
      occurredOn: '2026-11-01',
    });
    await call(ana, 'cakes:record', {
      guestName: 'Diogo',
      reason: 'Alugou um telhado',
      occurredOn: '2026-01-10',
    });
    const st = await state(ana);
    expect(st.debts.find((d) => d.personId === me.id)?.status).toBe('owed');
    expect(st.people.find((p) => p.name === 'Diogo')).toMatchObject({ userId: null });
  });

  it('cancel: the recorder while pending, otherwise admins only', async () => {
    const { host, ana, rui } = await setup();
    const target = await personOf(ana, 'Rui');
    await call(ana, 'cakes:record', {
      personId: target.id,
      reason: 'Engano',
      occurredOn: '2026-11-20',
    });
    let debt = (await state(ana)).debts[0]!;
    await call(ana, 'cakes:cancel', { debtId: debt.id });
    expect((await state(ana)).debts).toHaveLength(0);

    await call(ana, 'cakes:record', {
      personId: target.id,
      reason: 'Casamento',
      occurredOn: '2026-11-20',
    });
    debt = (await state(ana)).debts[0]!;
    await call(rui, 'cakes:confirm', { debtId: debt.id });
    expect(await emit(ana, 'cakes:cancel', { debtId: debt.id })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    await call(host, 'cakes:cancel', { debtId: debt.id });
    expect((await state(ana)).debts).toHaveLength(0);
  });
});

describe('paying', () => {
  it('the debtor promises a day; someone else confirms the cake arrived', async () => {
    const { ana, rui } = await setup();
    const me = await personOf(ana, 'Ana');
    await call(ana, 'cakes:record', {
      personId: me.id,
      reason: 'Certificação',
      occurredOn: '2026-10-01',
    });
    const debt = (await state(ana)).debts[0]!;

    expect(await emit(rui, 'cakes:pledge', { debtId: debt.id, date: '2099-01-07' })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    await call(ana, 'cakes:pledge', { debtId: debt.id, date: '2099-01-07' });
    expect((await state(ana)).debts[0]).toMatchObject({
      pledgedOn: '2099-01-07',
      pledgeKind: 'volunteer',
    });

    expect(await emit(ana, 'cakes:paid', { debtId: debt.id })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    const events = collect(ana, 'message:new');
    await call(rui, 'cakes:paid', { debtId: debt.id });
    await sleep(50);
    expect((await state(ana)).debts[0]).toMatchObject({ status: 'paid' });
    expect(mascotSaid(events).at(-1)?.card).toEqual({ type: 'paid', ref: debt.id });
  });
});

describe('birthdays', () => {
  it('at 09:00 on the day: one debt per year and congratulations, never twice', async () => {
    const { ana } = await setup();
    const me = await personOf(ana, 'Ana');
    await call(ana, 'people:setBirthday', { personId: me.id, birthday: '11-27' });
    const events = collect(ana, 'message:new');

    s.ctx.community.tick(new Date(2026, 10, 27, 8, 59).getTime());
    expect((await state(ana)).debts).toHaveLength(0);
    s.ctx.community.tick(new Date(2026, 10, 27, 9, 0).getTime());
    s.ctx.community.tick(new Date(2026, 10, 27, 15, 0).getTime());
    await sleep(50);
    const debts = (await state(ana)).debts;
    expect(debts).toEqual([
      expect.objectContaining({ kind: 'birthday', occurredOn: '2026-11-27', status: 'owed' }),
    ]);
    // (Friday afternoon also opens the office vote; only the birthday card matters here.)
    const congrats = mascotSaid(events).filter((m) => m.card?.type === 'birthday');
    expect(congrats).toHaveLength(1);
    expect(congrats[0]!.mentions).toContain(me.userId);

    s.ctx.community.tick(new Date(2027, 10, 27, 10, 0).getTime());
    expect((await state(ana)).debts).toHaveLength(2);
  });
});

describe('Excel import', () => {
  const CAKES = [
    'Data\tRéu\tMotivo\tEstado',
    '25/02/2025\tAna\tEntrada Noesis\tOk',
    '06/07/2026\tRUI\tPai First Time\tEm Falta',
    '45863\tIgor Silva\tFinalmente Mestre da Culinária\tOk',
    'ontem\tNinguém\tX\tOk',
  ].join('\n');

  it('previews matches, guests and errors; commits once', async () => {
    const { host, ana } = await setup();
    const { rows } = await call(host, 'admin:import:preview', { sheet: 'cakes', text: CAKES });
    expect(rows.map((r) => [r.name, r.date, r.status, r.personId !== null, r.error])).toEqual([
      ['Ana', '2025-02-25', 'paid', true, null],
      ['RUI', '2026-07-06', 'owed', true, null],
      ['Igor Silva', '2025-07-25', 'paid', false, null],
      ['Ninguém', null, 'paid', false, 'data inválida'],
    ]);
    expect(await emit(ana, 'admin:import:preview', { sheet: 'cakes', text: CAKES })).toMatchObject({
      ok: false,
    });

    expect(await call(host, 'admin:import:commit', { sheet: 'cakes', text: CAKES })).toEqual({
      created: 3,
      skipped: 1,
      guests: 1,
    });
    expect(await call(host, 'admin:import:commit', { sheet: 'cakes', text: CAKES })).toMatchObject({
      created: 0,
    });

    const st = await state(host);
    const rui = st.people.find((p) => p.name === 'Rui')!;
    expect(st.debts.find((d) => d.personId === rui.id)).toMatchObject({
      status: 'owed',
      reason: 'Pai First Time',
    });
  });

  it('birthdays set the day and month and the year’s cake', async () => {
    const { host } = await setup();
    await call(host, 'admin:import:commit', {
      sheet: 'birthdays',
      text: '18/08/2026\tAna\tEm Falta',
    });
    const st = await state(host);
    const ana = st.people.find((p) => p.name === 'Ana')!;
    expect(ana.birthday).toBe('08-18');
    expect(st.debts.find((d) => d.personId === ana.id)).toMatchObject({
      kind: 'birthday',
      status: 'owed',
    });
  });

  it('reads Excel date formats', () => {
    expect(parseSheetDate('13/03/2025')).toBe('2025-03-13');
    expect(parseSheetDate('1/2/26')).toBe('2026-02-01');
    expect(parseSheetDate('2026-07-06')).toBe('2026-07-06');
    expect(parseSheetDate('45729')).toBe('2025-03-13');
    expect(parseSheetDate('31/02/2026')).toBeNull();
    expect(parseSheetDate('amanhã')).toBeNull();
  });
});
