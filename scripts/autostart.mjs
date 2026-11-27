#!/usr/bin/env node
// `pnpm autostart` — makes Pausa start by itself on this Windows PC (Phase 14):
//   • task "Pausa": `pnpm demo` when you sign in (after 30 s), minimized, retried up to 3× on failure
//   • task "Pausa backup": `pnpm backup` every day at 13:00 (or as soon as the PC is on)
// Only for your user, no admin rights, no stored password.
//   pnpm autostart              install or update both tasks
//   pnpm autostart -- --status  show them
//   pnpm autostart -- --remove  remove them
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appTaskXml, backupTaskXml, TASKS } from './tasks.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv.includes('--remove')
  ? 'remove'
  : process.argv.includes('--status')
    ? 'status'
    : 'install';

if (process.platform !== 'win32') {
  console.error('O arranque automático usa o Agendador de Tarefas do Windows.');
  process.exit(1);
}

const schtasks = (args) => spawnSync('schtasks', args, { encoding: 'utf8' });
const user = process.env.USERDOMAIN
  ? `${process.env.USERDOMAIN}\\${userInfo().username}`
  : userInfo().username;

function install(name, xml) {
  const dir = mkdtempSync(join(tmpdir(), 'pausa-task-'));
  const file = join(dir, 'task.xml');
  try {
    // Task Scheduler reads UTF-16 LE with a byte-order mark.
    writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]));
    const res = schtasks(['/Create', '/TN', name, '/XML', file, '/F']);
    if (res.status !== 0) throw new Error((res.stderr || res.stdout).trim());
    console.log(`✔ Tarefa "${name}" instalada.`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Via PowerShell, so the output doesn't depend on Windows' display language (schtasks' does). */
function status(name) {
  const script =
    `$t = Get-ScheduledTask -TaskName '${name}' -ErrorAction SilentlyContinue; if (-not $t) { exit 3 }; ` +
    `$i = $t | Get-ScheduledTaskInfo; $f = { param($d) if ($d -and $d.Year -gt 2000) { $d.ToString('yyyy-MM-dd HH:mm') } else { '-' } }; ` +
    `Write-Output ('{0}|{1}|{2}|{3}' -f $t.State, (& $f $i.NextRunTime), (& $f $i.LastRunTime), $i.LastTaskResult)`;
  const res = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
  if (res.status !== 0) return console.log(`✖ "${name}": não instalada.`);
  const [state, next, last, result] = res.stdout.trim().split('|');
  console.log(`• "${name}": ${state} · próxima: ${next} · última: ${last} (resultado ${result})`);
}

if (mode === 'install') {
  try {
    install(TASKS.app, appTaskXml({ root, user }));
    install(TASKS.backup, backupTaskXml({ root, user }));
  } catch (err) {
    console.error(`\n✖ Não consegui criar a tarefa:\n  ${err.message}\n`);
    process.exit(1);
  }
  console.log(
    '\nA Pausa passa a ligar-se sozinha quando iniciares sessão no Windows (fica minimizada).\n' +
      'Cópia de segurança diária às 13:00 em data/backups (as últimas 14).\n' +
      'Para desfazer: pnpm autostart -- --remove',
  );
} else if (mode === 'remove') {
  for (const name of Object.values(TASKS)) {
    const res = schtasks(['/Delete', '/TN', name, '/F']);
    console.log(res.status === 0 ? `✔ "${name}" removida.` : `• "${name}" não estava instalada.`);
  }
} else {
  for (const name of Object.values(TASKS)) status(name);
}
