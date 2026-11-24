#!/usr/bin/env node
// `pnpm demo` — one command for demo day (DECISIONS D-20):
//   1. builds the app
//   2. opens a Cloudflare quick tunnel that only lets in ALLOWED_MAIL (email PIN gate)
//   3. starts the server with PUBLIC_URL set to the tunnel's address
//   4. prints the URL and, if the host hasn't signed in yet, a host invite link
// Ctrl+C stops both. Restarting gives a NEW URL, and everyone has to rejoin (quick-tunnel limit).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...readDotenv(join(root, '.env')), ...process.env };
const port = Number(env.PORT || 4747);
const allowed = (env.ALLOWED_MAIL || '').trim();

function readDotenv(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/** The trycloudflare.com URL cloudflared prints once the tunnel is up. */
export function findTunnelUrl(text) {
  const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(text);
  return match ? match[0] : null;
}

if (!allowed) {
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
if (
  spawnSync('pnpm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true }).status !== 0
) {
  fail('A compilação falhou.');
}

console.log(`A abrir o túnel (só entra: ${allowed})…`);
const tunnel = spawn(
  cloudflared,
  ['tunnel', '--url', `http://127.0.0.1:${port}`, '--allowed-mail', allowed],
  {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

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
    if (/\s(WRN|ERR)\s/.test(line)) console.error(`[túnel] ${line.trim()}`);
  }
  const url = !server && findTunnelUrl(output);
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

function startServer(url) {
  const serverEnv = { ...env, PUBLIC_URL: url, NODE_ENV: 'production' };
  server = spawn(process.execPath, [join(root, 'packages/server/dist/main.js')], {
    cwd: root,
    env: serverEnv,
    stdio: 'inherit',
  });
  server.on('exit', (code) => {
    if (!stopping) {
      console.error(`\n✖ O servidor terminou (código ${code}). A fechar o túnel.`);
      stop(1);
    }
  });

  setTimeout(() => {
    const init = spawnSync(
      process.execPath,
      [join(root, 'packages/server/dist/init.js'), '--if-needed'],
      {
        cwd: root,
        env: serverEnv,
        encoding: 'utf8',
      },
    );
    const hostLink = /https:\/\/\S+\/join#\S+/.exec(init.stdout ?? '')?.[0];
    console.log('\n──────────────────────────────────────────────────────────────');
    console.log(`  Pausa no ar:  ${url}`);
    console.log(`  Só entra quem estiver em: ${allowed}`);
    if (hostLink)
      console.log(`\n  Entra tu primeiro (link de anfitrião, uso único):\n  ${hostLink}`);
    console.log('\n  Convites: menu → Administração → Criar convite');
    console.log('  Ctrl+C para desligar. Atenção: ao voltar a ligar, o endereço muda.');
    console.log('──────────────────────────────────────────────────────────────\n');
  }, 1500);
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
