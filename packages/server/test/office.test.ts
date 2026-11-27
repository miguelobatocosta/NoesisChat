import { afterEach, describe, expect, it } from 'vitest';
import { MASCOTS, type Message } from '@pausa/shared';
import { addDays, isoDate, parseIso } from '../src/community/dates';
import { pickWeekday } from '../src/community/office';
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
/** A local time on an ISO date. */
const at = (iso: string, hour: number, minute = 0) => {
  const d = parseIso(iso);
  d.setHours(hour, minute);
  return d.getTime();
};
const TODAY = () => isoDate(new Date());

async function setup() {
  s = await startTestServer(ENV);
  const host = await s.connect(s.user('Costa', 'host'));
  const ana = await s.connect(s.user('Ana'));
  const rui = await s.connect(s.user('Rui'));
  return { host, ana, rui };
}

describe('the weekly vote', () => {
  it('picks the most voted day; ties go to Wednesday if tied, else the earliest; none → Wednesday', () => {
    expect(
      pickWeekday(
        new Map([
          [2, 3],
          [4, 1],
        ]),
      ),
    ).toBe(2);
    expect(
      pickWeekday(
        new Map([
          [2, 2],
          [3, 2],
          [5, 2],
        ]),
      ),
    ).toBe(3);
    expect(
      pickWeekday(
        new Map([
          [4, 2],
          [2, 2],
        ]),
      ),
    ).toBe(2);
    expect(pickWeekday(new Map())).toBe(3);
  });

  it('opens Friday 12:00 with a card, accepts votes, decides Monday 10:00 and posts the result', async () => {
    const { ana, rui } = await setup();
    const events = collect(ana, 'message:new');
    const FRIDAY = '2030-01-04';
    const MONDAY = '2030-01-07';

    s.ctx.community.tick(at(FRIDAY, 11, 59));
    expect((await state(ana)).weeks.find((w) => w.weekStart === MONDAY)).toBeUndefined();
    s.ctx.community.tick(at(FRIDAY, 12, 0));
    await sleep(50);
    expect((await state(ana)).weeks.find((w) => w.weekStart === MONDAY)).toMatchObject({
      status: 'voting',
    });
    expect(mascotSaid(events).at(-1)?.card).toEqual({ type: 'officePoll', ref: MONDAY });

    await call(ana, 'office:vote', { weekStart: MONDAY, weekdays: [2, 4] });
    await call(rui, 'office:vote', { weekStart: MONDAY, weekdays: [4] });
    await call(ana, 'office:vote', { weekStart: MONDAY, weekdays: [4, 5] }); // changes her mind

    s.ctx.community.tick(at(MONDAY, 9, 59));
    expect((await state(ana)).weeks.find((w) => w.weekStart === MONDAY)?.status).toBe('voting');
    s.ctx.community.tick(at(MONDAY, 10, 0));
    await sleep(50);
    const week = (await state(ana)).weeks.find((w) => w.weekStart === MONDAY)!;
    expect(week).toMatchObject({ status: 'decided', chosenOn: '2030-01-10' }); // Thursday: 2 votes
    expect(mascotSaid(events).at(-1)?.card).toEqual({ type: 'officeDay', ref: '2030-01-10' });

    expect(await emit(ana, 'office:vote', { weekStart: MONDAY, weekdays: [1] })).toMatchObject({
      ok: false,
    });
  });

  it('a first start mid-week never invents a day nobody voted on', async () => {
    const { ana } = await setup();
    s.ctx.community.tick(at('2030-01-09', 15)); // a Wednesday, no vote was ever opened
    expect((await state(ana)).days.filter((d) => d.weekStart === '2030-01-07')).toEqual([]);
  });

  it('admins move the day', async () => {
    const { host, ana } = await setup();
    s.ctx.community.tick(at('2030-01-04', 12));
    s.ctx.community.tick(at('2030-01-07', 10));
    expect(
      await emit(ana, 'admin:office:setDay', { weekStart: '2030-01-07', date: '2030-01-08' }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    await call(host, 'admin:office:setDay', { weekStart: '2030-01-07', date: '2030-01-08' });
    const st = await state(host);
    expect(st.weeks.find((w) => w.weekStart === '2030-01-07')?.chosenOn).toBe('2030-01-08');
    expect(st.days.map((d) => d.date)).toContain('2030-01-08');
    expect(st.days.map((d) => d.date)).not.toContain('2030-01-09');
  });
});

describe('the day', () => {
  it('check-in on the day; someone there marks a colleague; excuses go to the admin', async () => {
    const { host, ana, rui } = await setup();
    const today = TODAY();
    await call(host, 'admin:office:addDay', { date: today });
    const ruiP = await personOf(ana, 'Rui');

    expect(
      await emit(ana, 'office:mark', { date: today, personId: ruiP.id, status: 'absent' }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    await call(ana, 'office:checkin', { date: today });
    await call(ana, 'office:mark', { date: today, personId: ruiP.id, status: 'absent' });
    await call(rui, 'office:excuse', { date: today, excuse: 'Fui ao dentista' });

    const att = (await state(ana)).attendance.filter((a) => a.date === today);
    expect(att.find((a) => a.personId === ruiP.id)).toMatchObject({
      status: 'absent',
      excuse: 'Fui ao dentista',
    });
    expect(att.find((a) => a.personId === ruiP.id)?.judgement).toBeNull();
  });

  it('closing the day: notice → justified, excuse → pending, nothing → unjustified', async () => {
    const { host, ana, rui } = await setup();
    const tomorrow = addDays(TODAY(), 1);
    await call(host, 'admin:office:addDay', { date: tomorrow });
    await call(ana, 'office:plan', { date: tomorrow, plan: 'not_going', reason: 'Férias' }); // before the day
    await call(rui, 'office:excuse', { date: tomorrow, excuse: 'Trânsito' });

    s.ctx.community.tick(at(addDays(tomorrow, 1), 0, 30));
    const st = await state(host);
    const of = async (name: string) =>
      st.attendance.find(
        (a) => a.date === tomorrow && a.personId === st.people.find((p) => p.name === name)!.id,
      );
    expect(await of('Ana')).toMatchObject({
      status: 'absent',
      judgement: 'justified',
      noticeGiven: true,
    });
    expect(await of('Rui')).toMatchObject({ status: 'absent', judgement: 'pending' });
    expect(await of('Costa')).toMatchObject({ status: 'absent', judgement: 'unjustified' });
    expect(st.days.find((d) => d.date === tomorrow)?.closed).toBe(true);
  });

  it('N unjustified absences = a cake, and the count starts again; judging counts too', async () => {
    const { host, ana } = await setup();
    await call(host, 'admin:settings:update', { noshowLimit: 2 });
    const d1 = addDays(TODAY(), 1);
    const d2 = addDays(TODAY(), 2);
    await call(host, 'admin:office:addDay', { date: d1 });
    await call(host, 'admin:office:addDay', { date: d2 });
    const anaP = await personOf(ana, 'Ana');
    await call(ana, 'office:excuse', { date: d2, excuse: 'Esqueci-me' });
    const events = collect(ana, 'message:new');

    s.ctx.community.tick(at(addDays(TODAY(), 3), 1));
    await sleep(50);
    let st = await state(host);
    expect(st.debts.filter((d) => d.personId === anaP.id && d.kind === 'noshow')).toHaveLength(0); // 1 + pending

    await call(host, 'admin:office:judge', {
      date: d2,
      personId: anaP.id,
      judgement: 'unjustified',
    });
    await sleep(50);
    st = await state(host);
    expect(st.debts.filter((d) => d.personId === anaP.id && d.kind === 'noshow')).toEqual([
      expect.objectContaining({ reason: '2 faltas sem aviso', status: 'owed' }),
    ]);
    expect(st.attendance.filter((a) => a.personId === anaP.id).every((a) => a.counted)).toBe(true);
    expect(mascotSaid(events).some((m) => m.mentions.includes(anaP.userId!))).toBe(true);
  });

  it('day before at 12:00: nobody volunteered → the oldest debt among those going is nominated', async () => {
    const { host, ana, rui } = await setup();
    const tomorrow = addDays(TODAY(), 1);
    await call(host, 'admin:office:addDay', { date: tomorrow });
    const anaP = await personOf(ana, 'Ana');
    const ruiP = await personOf(ana, 'Rui');
    await call(ana, 'cakes:record', {
      personId: anaP.id,
      reason: 'Casa nova',
      occurredOn: '2026-05-01',
    });
    await call(rui, 'cakes:record', {
      personId: ruiP.id,
      reason: 'Casamento',
      occurredOn: '2025-01-01',
    }); // older, but Rui isn't going
    await call(ana, 'office:plan', { date: tomorrow, plan: 'going' });

    const events = collect(ana, 'message:new');
    s.ctx.community.tick(at(TODAY(), 11, 59));
    expect((await state(ana)).debts.find((d) => d.personId === anaP.id)?.pledgedOn).toBeNull();
    s.ctx.community.tick(at(TODAY(), 12, 0));
    await sleep(50);
    expect((await state(ana)).debts.find((d) => d.personId === anaP.id)).toMatchObject({
      pledgedOn: tomorrow,
      pledgeKind: 'nominated',
    });
    expect(mascotSaid(events).at(-1)).toMatchObject({ card: { type: 'cakeCall', ref: tomorrow } });
  });

  it('a volunteer means nobody is nominated', async () => {
    const { host, ana } = await setup();
    const tomorrow = addDays(TODAY(), 1);
    await call(host, 'admin:office:addDay', { date: tomorrow });
    const anaP = await personOf(ana, 'Ana');
    await call(ana, 'cakes:record', {
      personId: anaP.id,
      reason: 'Casa nova',
      occurredOn: '2026-05-01',
    });
    await call(ana, 'cakes:record', {
      personId: anaP.id,
      reason: 'Carro',
      occurredOn: '2026-01-01',
    });
    const [, newer] = (await state(ana)).debts;
    await call(ana, 'cakes:pledge', { debtId: newer!.id, date: tomorrow });
    await call(ana, 'office:plan', { date: tomorrow, plan: 'going' });
    s.ctx.community.tick(at(TODAY(), 13));
    const debts = (await state(ana)).debts;
    expect(debts.filter((d) => d.pledgedOn === tomorrow)).toHaveLength(1);
  });
});

describe('Presenças import', () => {
  it('imports history: present, justified, unjustified; never counts towards a no-show cake', async () => {
    const { host } = await setup();
    await call(host, 'admin:settings:update', { noshowLimit: 1 });
    const sheet = [
      'Data\tNome\tPresença\tDesculpa\tBolo\tAviso Prévio\tJustificação',
      '13/03/2025\tAna\tx',
      '13/03/2025\tRui\t\tOperação ao Nariz\t\tx\tJustificado',
      '17/03/2025\tRui\t\tNão Compareceu\t\t\tNão justificado',
      '17/03/2025\tFabrício Hoepers\tx',
      '17/03/2025\tJosé Ribeiro',
    ].join('\n');
    const { rows } = await call(host, 'admin:import:preview', { sheet: 'attendance', text: sheet });
    expect(rows.map((r) => r.error)).toEqual([null, null, null, null, 'linha vazia']);
    expect(await call(host, 'admin:import:commit', { sheet: 'attendance', text: sheet })).toEqual({
      created: 4,
      skipped: 1,
      guests: 1,
    });

    s.ctx.community.settleNoShows();
    const st = await state(host);
    expect(st.debts.filter((d) => d.kind === 'noshow')).toEqual([]);
    const fab = st.people.find((p) => p.name === 'Fabrício Hoepers')!;
    expect(fab).toMatchObject({ userId: null, inTeam: true });
  });
});
