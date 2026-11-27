#!/usr/bin/env node
// `pnpm demo` — one command to put Pausa online (DECISIONS D-20, D-50). Two modes, picked from .env:
//
//  • Fixed address (TUNNEL_NAME + TUNNEL_URL set): runs the named Cloudflare tunnel, e.g.
//    https://pausa.example.com. The email gate is a Cloudflare Access application on that hostname
//    (see README "Endereço fixo"). Before announcing anything, this script checks the gate is really on
//    and refuses to stay up if it isn't. Restarting keeps the address, so nobody has to rejoin.
//  • Quick tunnel (otherwise): a random trycloudflare.com address with the email gate built in
//    (ALLOWED_MAIL). Restarting gives a NEW address and everyone has to rejoin.
//
// Both: builds the app, starts the server with PUBLIC_URL, prints the host link if needed. Ctrl+C stops all.
import { spawn, spawnSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, parseEnv } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...readDotenv(join(root, '.env')), ...process.env };
const port = Number(env.PORT || 4747);
const allowed = (env.ALLOWED_MAIL || '').trim();
const tunnelName = (env.TUNNEL_NAME || '').trim();
const fixedUrl = tunnelName ? (env.TUNNEL_URL || '').trim().replace(/\/+$/, '') : '';

// Everything this script and the server print also goes to DATA_DIR/logs/demo-YYYY-MM-DD.log
// (UTF-8), so a minimized or auto-started window can be read afterwards. Kept 14 days.
const LOG_DAYS = 14;
const logDir = join(resolve(root, env.DATA_DIR || 'data'), 'logs');
mkdirSync(logDir, { recursive: true });
for (const name of readdirSync(logDir)) {
  const file = join(logDir, name);
  if (/^demo-.*\.log$/.test(name) && Date.now() - statSync(file).mtimeMs > LOG_DAYS * 86_400_000)
    rmSync(file, { force: true });
}
const logStream = createWriteStream(
  join(logDir, `demo-${new Date().toISOString().slice(0, 10)}.log`),
  {
    flags: 'a',
  },
);
for (const level of ['log', 'warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    original(...args);
    logStream.write(`${new Date().toISOString()} ${format(...args)}\n`);
  };
}

function readDotenv(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/** The trycloudflare.com URL cloudflared prints once a quick tunnel is up. */
export function findTunnelUrl(text) {
  const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(text);
  return match ? match[0] : null;
}

if (tunnelName && !/^https:\/\/[a-z0-9.-]+$/i.test(fixedUrl)) {
  fail(
    'TUNNEL_NAME está definido, mas TUNNEL_URL não é um endereço https válido.\n' +
      '  Exemplo no .env:\n    TUNNEL_NAME=pausa\n    TUNNEL_URL=https://pausa.exemplo.com',
  );
}
if (!tunnelName && !allowed) {
  fail(
    'ALLOWED_MAIL está vazio no .env.\n' +
      '  Põe os emails de quem pode entrar, separados por vírgulas, ou um domínio inteiro:\n' +
      '    ALLOWED_MAIL=ana@empresa.pt,rui@empresa.pt\n    ALLOWED_MAIL=*@empresa.pt\n' +
      '  Sem isto, o link do túnel ficava aberto a qualquer pessoa na internet.',
  );
}

const cloudflared = env.CLOUDFLARED_BIN || 'cloudflared';
if (spawnSync(cloudflared, ['--version'], { stdio: 'ignore' }).status !== 0) {
  fail('cloudflared não está instalado. No Windows: winget install --id Cloudflare.cloudflared');
}

console.log('A compilar…');
if (spawnSync('pnpm run build', { cwd: root, stdio: 'inherit', shell: true }).status !== 0) {
  fail('A compilação falhou.');
}

const origin = `http://127.0.0.1:${port}`;
const tunnelArgs = tunnelName
  ? ['tunnel', '--no-autoupdate', 'run', '--url', origin, tunnelName]
  : ['tunnel', '--url', origin, '--allowed-mail', allowed];
console.log(
  tunnelName
    ? `A ligar o túnel "${tunnelName}" → ${fixedUrl}…`
    : `A abrir o túnel (só entra: ${allowed})…`,
);
const tunnel = spawn(cloudflared, tunnelArgs, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });

let server;
let output = '';
const timeout = setTimeout(() => {
  tunnel.kill();
  fail(`O túnel não respondeu em 60 s. Últimas linhas do cloudflared:\n${output.slice(-1500)}`);
}, 60_000);

const onTunnelOutput = (chunk) => {
  const text = chunk.toString();
  output = (output + text).slice(-20_000);
  // Show cloudflared's warnings and errors (e.g. why the email gate refused someone); hide the chatter.
  for (const line of text.split(/\r?\n/)) {
    if (/\s(WRN|ERR)\s|auth|mail|access|forbid|denied/i.test(line))
      console.error(`[túnel] ${line.trim()}`);
  }
  if (server) return;
  const url = tunnelName
    ? /Registered tunnel connection/.test(output) && fixedUrl
    : findTunnelUrl(output);
  if (url) {
    clearTimeout(timeout);
    startServer(url);
  }
};
tunnel.stdout.on('data', onTunnelOutput);
tunnel.stderr.on('data', onTunnelOutput);
tunnel.on('exit', (code) => {
  if (!stopping) {
    console.error(
      `\n✖ O cloudflared terminou (código ${code}). A desligar o servidor.\n` +
        `Últimas linhas do cloudflared:\n${output.slice(-1500)}`,
    );
    stop(1);
  }
});

/**
 * With a fixed address the email gate lives in Cloudflare Access, not in this script, so prove it:
 * the API must bounce to Cloudflare's login, and only the invite hand-off may pass (D-50).
 */
async function checkGate(url) {
  const probe = async (path) => {
    const res = await fetch(url + path, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    return { status: res.status, location: res.headers.get('location') ?? '' };
  };
  for (let attempt = 1; ; attempt++) {
    try {
      const api = await probe('/api/session');
      const gated =
        [301, 302, 303, 307].includes(api.status) && /cloudflareaccess\.com/.test(api.location);
      if (!gated) {
        return api.status === 200 || api.status === 401
          ? 'O portão de email está DESLIGADO: a API responde sem pedir email. Cria a aplicação no Cloudflare Access (README, "Endereço fixo").'
          : `Resposta inesperada de ${url}/api/session (HTTP ${api.status}).`;
      }
      const handoff = await probe('/invite-handoff.js');
      if (handoff.status !== 200) {
        console.warn(
          '\n⚠ O portão está ligado, mas /join e /invite-handoff.js não estão em "Bypass" no Access.\n' +
            '  Funciona na mesma; só que os convidados vão ter de abrir o link duas vezes.\n',
        );
      }
      return null;
    } catch (err) {
      if (attempt >= 5) return `Não consegui chegar a ${url} (${err.message}).`;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

/** Waits until the server answers locally, so the checks below don't race its startup. */
async function serverReady() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

function startServer(url) {
  const serverEnv = { ...env, PUBLIC_URL: url, NODE_ENV: 'production' };
  server = spawn(process.execPath, [join(root, 'packages/server/dist/main.js')], {
    cwd: root,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    logStream.write(chunk);
  });
  server.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    logStream.write(chunk);
  });
  server.on('exit', (code) => {
    if (!stopping) {
      console.error(`\n✖ O servidor terminou (código ${code}). A fechar o túnel.`);
      stop(1);
    }
  });

  void (async () => {
    await serverReady();
    if (tunnelName) {
      const problem = await checkGate(url);
      if (problem) {
        console.error(`\n✖ ${problem}\n  Por segurança, a desligar.`);
        return stop(1);
      }
    }
    const init = spawnSync(
      process.execPath,
      [join(root, 'packages/server/dist/init.js'), '--if-needed'],
      { cwd: root, env: serverEnv, encoding: 'utf8' },
    );
    const hostLink = /https:\/\/\S+\/join#\S+/.exec(init.stdout ?? '')?.[0];
    console.log('\n──────────────────────────────────────────────────────────────');
    console.log(`  Pausa no ar:  ${url}`);
    console.log(
      tunnelName
        ? '  Só entra quem a regra do Cloudflare Access deixar.'
        : `  Só entra quem estiver em: ${allowed}`,
    );
    if (hostLink)
      console.log(`\n  Entra tu primeiro (link de anfitrião, uso único):\n  ${hostLink}`);
    console.log('\n  Convites: menu → Administração → Criar convite');
    console.log(
      tunnelName
        ? '  Ctrl+C para desligar. O endereço fica o mesmo quando voltares a ligar.'
        : '  Ctrl+C para desligar. Atenção: ao voltar a ligar, o endereço muda.',
    );
    console.log('──────────────────────────────────────────────────────────────\n');
  })();
}

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  server?.kill('SIGINT'); // lets the server tell clients it's going away
  setTimeout(() => {
    tunnel.kill();
    process.exit(code);
  }, 800);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
