// `pnpm server:init [--name "Costa"] [--expires 24h|7d] [--if-needed]`
// No host yet  → prints a one-time host invite link.
// Host exists → prints a one-time link that signs the host in on another browser.
// --if-needed  → does nothing if the host already has an active device (used by `pnpm demo`).
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Config } from '../config';
import { loadConfig } from '../config';
import { logAdmin } from '../admin/service';
import { createInvite, inviteBaseUrl, inviteLink } from '../auth/invites';
import { countDevices } from '../auth/sessions';
import { type Db, openDatabase } from '../db';

export interface IssueResult {
  kind: 'host-invite' | 'host-device' | 'none';
  link?: string;
  hostName?: string;
}

export function issueHostLink(
  db: Db,
  config: Config,
  options: { name?: string; expiresIn?: '24h' | '7d'; ifNeeded?: boolean } = {},
): IssueResult {
  const host = db
    .prepare(`SELECT id, display_name FROM users WHERE role = 'host' AND revoked_at IS NULL`)
    .get() as { id: string; display_name: string } | undefined;

  if (host && options.ifNeeded && countDevices(db, host.id) > 0)
    return { kind: 'none', hostName: host.display_name };

  const { invite, code } = host
    ? createInvite(db, { createdBy: null, forUserId: host.id, expiresIn: options.expiresIn })
    : createInvite(db, {
        createdBy: null,
        grantRole: 'host',
        intendedName: options.name ?? null,
        expiresIn: options.expiresIn,
      });
  logAdmin(db, null, host ? 'cli.host-device-link' : 'cli.host-invite', 'invite', invite.id);

  const result: IssueResult = {
    kind: host ? 'host-device' : 'host-invite',
    link: inviteLink(inviteBaseUrl(config), code),
  };
  if (host) result.hostName = host.display_name;
  return result;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      expires: { type: 'string', default: '24h' },
      'if-needed': { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });
  const expiresIn = values.expires === '7d' ? '7d' : '24h';
  const config = loadConfig();
  const db = openDatabase(join(config.dataDir, 'db.sqlite'));
  try {
    const opts: { name?: string; expiresIn: '24h' | '7d'; ifNeeded: boolean } = {
      expiresIn,
      ifNeeded: values['if-needed'],
    };
    if (values.name) opts.name = values.name;
    const result = issueHostLink(db, config, opts);
    if (result.kind === 'none') {
      console.log(`O anfitrião (${result.hostName}) já tem sessão iniciada. Nada a fazer.`);
    } else if (result.kind === 'host-invite') {
      console.log(
        `\nConvite de anfitrião (uso único, expira em ${expiresIn}):\n\n  ${result.link}\n`,
      );
    } else {
      console.log(
        `\nLink para ${result.hostName} entrar noutro browser (uso único, expira em ${expiresIn}):\n\n  ${result.link}\n`,
      );
    }
    if (!config.publicUrl && result.kind !== 'none') {
      console.log(
        'Este link usa localhost. Para colegas, usa `pnpm demo`, que imprime o link do túnel.\n',
      );
    }
  } finally {
    db.close();
  }
}

if (process.argv[1] && /cli[\\/]init\.(ts|js)$|init\.js$/.test(process.argv[1])) main();
