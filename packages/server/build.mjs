// Bundles the server and its CLIs into dist/. Workspace packages (@pausa/*) are inlined because they
// ship TypeScript source; every other dependency stays external and loads from node_modules.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith('@pausa/'));

await build({
  absWorkingDir: root,
  entryPoints: {
    main: 'src/main.ts',
    init: 'src/cli/init.ts',
    invite: 'src/cli/invite.ts',
    seed: 'src/cli/seed.ts',
    backup: 'src/cli/backup.ts',
    restore: 'src/cli/restore.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external,
  logLevel: 'warning',
});
