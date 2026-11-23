import { mkdirSync } from 'node:fs';
import { APP_NAME } from '@pausa/shared';
import { buildApp } from './app';
import { ConfigError, loadConfig } from './config';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  mkdirSync(config.dataDir, { recursive: true });

  const app = await buildApp(config, { logger: true });
  await app.listen({ port: config.port, host: config.bind });

  const local = `http://${config.bind.includes(':') ? `[${config.bind}]` : config.bind}:${config.port}`;
  console.log(
    `${APP_NAME} a correr em ${local}${config.publicUrl ? ` · público: ${config.publicUrl}` : ''}`,
  );
  console.log(`Dados em ${config.dataDir}`);

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`\n${signal} recebido, a desligar…`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

await main();
