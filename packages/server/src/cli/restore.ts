// `pnpm restore <backup-folder>` — replaces the database and uploads with a backup.
// Refuses while the server is running. The current data is moved aside, never deleted.
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { type Config, loadConfig } from '../config';

export async function serverIsRunning(config: Config): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${config.port}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function restoreBackup(config: Config, backupDir: string, now = Date.now()): string {
  const source = resolve(backupDir);
  if (!existsSync(join(source, 'db.sqlite')))
    throw new Error(`${source} is not a backup folder (no db.sqlite)`);

  const aside = join(config.dataDir, `pre-restore-${now}`);
  mkdirSync(aside, { recursive: true });
  for (const name of ['db.sqlite', 'db.sqlite-wal', 'db.sqlite-shm', 'uploads']) {
    const p = join(config.dataDir, name);
    if (existsSync(p)) renameSync(p, join(aside, name));
  }

  cpSync(join(source, 'db.sqlite'), join(config.dataDir, 'db.sqlite'));
  mkdirSync(join(config.dataDir, 'uploads'), { recursive: true });
  const uploads = join(source, 'uploads');
  if (existsSync(uploads)) {
    for (const f of readdirSync(uploads))
      cpSync(join(uploads, f), join(config.dataDir, 'uploads', f));
  }
  return aside;
}

if (process.argv[1] && /restore\.(ts|js)$/.test(process.argv[1])) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Uso: pnpm restore <pasta-da-cópia>');
    process.exit(1);
  }
  const config = loadConfig();
  if (await serverIsRunning(config)) {
    console.error('O servidor está a correr. Desliga-o primeiro (Ctrl+C) e volta a tentar.');
    process.exit(1);
  }
  const aside = restoreBackup(config, dir);
  console.log(
    `Restaurado a partir de ${basename(resolve(dir))}.\nOs dados anteriores ficaram em:\n  ${aside}`,
  );
}
