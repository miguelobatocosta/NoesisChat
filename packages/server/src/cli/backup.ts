// `pnpm backup` — consistent copy of the database (SQLite online backup) plus every uploaded file,
// into DATA_DIR/backups/YYYY-MM-DD-HHmm/. Safe while the server runs. Keeps the newest 14.
// A backup on the same disk is not a backup: copy the folder off this PC (see docs/OPERATIONS.md).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { type Config, loadConfig } from '../config';

export const KEEP = 14;

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function runBackup(config: Config, now = new Date()): Promise<string> {
  const root = join(config.dataDir, 'backups');
  const target = join(root, stamp(now));
  mkdirSync(target, { recursive: true });

  const db = new Database(join(config.dataDir, 'db.sqlite'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    await db.backup(join(target, 'db.sqlite'));
  } finally {
    db.close();
  }

  const uploads = join(config.dataDir, 'uploads');
  const files = existsSync(uploads) ? readdirSync(uploads).filter((f) => !f.endsWith('.part')) : [];
  mkdirSync(join(target, 'uploads'), { recursive: true });
  for (const f of files) cpSync(join(uploads, f), join(target, 'uploads', f));
  writeFileSync(
    join(target, 'manifest.json'),
    JSON.stringify({ createdAt: now.toISOString(), files: files.length }, null, 2),
  );

  // Rotation: keep the newest KEEP folders.
  const all = readdirSync(root)
    .filter((n) => /^\d{4}-\d{2}-\d{2}-\d{6}$/.test(n))
    .sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP)))
    rmSync(join(root, old), { recursive: true, force: true });
  return target;
}

if (process.argv[1] && /backup\.(ts|js)$/.test(process.argv[1])) {
  const config = loadConfig();
  const target = await runBackup(config);
  console.log(
    `Cópia de segurança criada em:\n  ${target}\nCopia esta pasta para fora deste PC (OneDrive, disco USB).`,
  );
}
