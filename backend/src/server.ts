import { assertProductionSafety, config } from './config';
import { createDatabase } from './db';
import { buildApp } from './app';
import { runMigrations } from './migrations';

async function main(): Promise<void> {
  assertProductionSafety();
  const db = createDatabase();
  const autoMigrate = (process.env.AUTO_MIGRATE ?? (config.isProduction ? 'false' : 'true')) === 'true';
  if (autoMigrate) {
    const result = await runMigrations(db.pool);
    if (result.applied.length) {
      console.log(JSON.stringify({ event: 'migrations_applied', migrations: result.applied }));
    }
  }
  const app = await buildApp({ db });
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting_down');
    await app.close().catch(() => undefined);
    await db.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error);
    await db.close().catch(() => undefined);
    process.exit(1);
  }
}

void main();
