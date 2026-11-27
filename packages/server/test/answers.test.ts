import { afterEach, describe, expect, it } from 'vitest';
import { MAIN_ROOM_ID, MASCOT_KEYS, MASCOTS, type Message } from '@pausa/shared';
import { detectQuestion } from '../src/mascots/answers';
import { normalize } from '../src/mascots/engine';
import { MASCOT_LINES } from '../src/mascots/lines';
import {
  call,
  cid,
  collect,
  sleep,
  startTestServer,
  type ClientSocket,
  type TestServer,
} from './harness';

let s: TestServer;
afterEach(async () => {
  await s?.close();
});

const fromMascot = (events: { message: Message }[]) =>
  events.map((e) => e.message).filter((m) => MASCOTS.some((x) => x.userId === m.userId));

async function ask(socket: ClientSocket, body: string): Promise<string> {
  const events = collect(socket, 'message:new');
  await call(socket, 'messages:send', { roomId: MAIN_ROOM_ID, clientId: cid(), body });
  await sleep(80);
  return fromMascot(events).at(-1)?.body ?? '';
}

describe('questions', () => {
  it('recognises the questions people actually ask', () => {
    const q = (t: string) => detectQuestion(normalize(t));
    expect(q('Dona Lurdes, quem deve mais bolos?')).toBe('owesMost');
    expect(q('quem é o caloteiro?')).toBe('owesMost');
    expect(q('quem já trouxe mais bolos ao office?')).toBe('broughtMost');
    expect(q('quantos bolos devo?')).toBe('myDebt');
    expect(q('quando é que vamos ao escritório?')).toBe('office');
    expect(q('quem leva bolo amanhã?')).toBe('cakeWho');
    expect(q('olá, tudo bem?')).toBeNull();
  });
});

describe('answers with real data', () => {
  it('who owes most, who brought most, my debt: from the cake book', async () => {
    s = await startTestServer({ MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0' });
    const host = await s.connect(s.user('Costa', 'host'));
    const ana = await s.connect(s.user('Ana'));
    const st = await call(host, 'community:state', {});
    const anaP = st.people.find((p) => p.name === 'Ana')!;
    const costaP = st.people.find((p) => p.name === 'Costa')!;
    await call(ana, 'cakes:record', {
      personId: anaP.id,
      reason: 'Casa',
      occurredOn: '2026-01-01',
    });
    await call(host, 'cakes:record', {
      personId: costaP.id,
      reason: 'Carro',
      occurredOn: '2026-06-01',
    });
    const [, carro] = (await call(host, 'community:state', {})).debts;
    await call(ana, 'cakes:paid', { debtId: carro!.id });

    // One question per person: mentions have a 10 s cooldown per person.
    expect(await ask(host, 'Dona Lurdes, quem deve mais bolos?')).toContain('Ana');
    const rui = await s.connect(s.user('Rui'));
    expect(await ask(rui, 'Dona Lurdes, quem trouxe mais bolos?')).toContain('Costa');
    expect(await ask(ana, 'Dona Lurdes, quantos bolos devo?')).toMatch(/1 bolo/);
  });

  it('nothing owed / no office day yet: says so, in character', async () => {
    s = await startTestServer({ MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0' });
    const host = await s.connect(s.user('Costa', 'host'));
    expect(MASCOT_LINES.lurdes.answers.nobodyOwes).toContain(
      await ask(host, 'Dona Lurdes, quem deve mais?'),
    );
    const rui = await s.connect(s.user('Rui'));
    expect(MASCOT_LINES.lurdes.answers.officeUnknown).toContain(
      await ask(rui, 'Dona Lurdes, quando é o escritório?'),
    );
  });

  it('an ordinary call still gets an ordinary answer', async () => {
    s = await startTestServer({ MASCOT_DELAY_MS: '0', MASCOT_CHANCE: '0' });
    const host = await s.connect(s.user('Costa', 'host'));
    const said = await ask(host, 'Dona Lurdes, olá!');
    expect(MASCOT_LINES.lurdes.mention.map((l) => l.replace('{name}', 'Costa'))).toContain(said);
  });

  it('every mascot has every answer', () => {
    const keys = Object.keys(MASCOT_LINES.lurdes.answers).sort();
    for (const k of MASCOT_KEYS)
      expect(Object.keys(MASCOT_LINES[k].answers).sort(), k).toEqual(keys);
  });
});
