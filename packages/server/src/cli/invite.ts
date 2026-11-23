// `pnpm server:invite [--name "Marta"] [--expires 24h|7d] [--json]`
// Creates a single-use member invite from the terminal (same as the admin panel).
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { logAdmin } from '../admin/service';
import { createInvite, inviteBaseUrl, inviteLink } from '../auth/invites';
import { loadConfig } from '../config';
import { openDatabase } from '../db';

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    expires: { type: 'string', default: '24h' },
    json: { type: 'boolean', default: false },
  },
});
const config = loadConfig();
const db = openDatabase(join(config.dataDir, 'db.sqlite'));
try {
  const expiresIn = values.expires === '7d' ? '7d' : '24h';
  const { invite, code } = createInvite(db, {
    createdBy: null,
    intendedName: values.name ?? null,
    expiresIn,
  });
  logAdmin(db, null, 'cli.member-invite', 'invite', invite.id);
  const link = inviteLink(inviteBaseUrl(config), code);
  if (values.json) console.log(JSON.stringify({ link, code }));
  else console.log(`\nConvite (uso único, expira em ${expiresIn}):\n\n  ${link}\n`);
} finally {
  db.close();
}
