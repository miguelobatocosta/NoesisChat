// Dev entry: `pnpm dev` runs this through tsx. Setting NODE_ENV here instead of in the npm script keeps
// it working in Windows shells. Production stays the default everywhere else (secure by default).
process.env['NODE_ENV'] ??= 'development';
await import('./main');
