import fs from 'node:fs';
import path from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';

const dataDir = path.resolve(process.cwd(), '.data/pg');
const port = Number.parseInt(process.env.PG_PORT ?? '55432', 10);
const user = process.env.PG_USER ?? 'postgres';
const password = process.env.PG_PASSWORD ?? 'postgres';
const database = process.env.PG_DATABASE ?? 'coalguard';

const cluster = new EmbeddedPostgres({
  databaseDir: dataDir,
  port,
  user,
  password,
  authMethod: 'password',
  persistent: true,
  onLog: (message) => {
    if (process.env.PG_LOG === '1') console.log(`[postgres] ${message.trim()}`);
  },
  onError: (error) => {
    console.error('[postgres]', error instanceof Error ? error.message : error);
  },
});

async function main(): Promise<void> {
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    console.log(`[db] initialising PostgreSQL cluster in ${dataDir}`);
    await cluster.initialise();
  }
  await cluster.start();
  console.log(`[db] PostgreSQL 16 listening on 127.0.0.1:${port}`);

  const admin = cluster.getPgClient('postgres');
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  if (exists.rowCount === 0) {
    await cluster.createDatabase(database);
    console.log(`[db] created database ${database}`);
  }
  await admin.end();

  const keepAlive = setInterval(() => undefined, 60_000);
  const shutdown = async (signal: string) => {
    clearInterval(keepAlive);
    console.log(`[db] ${signal} received, stopping cluster`);
    await cluster.stop().catch((error) => console.error('[db] stop failed', error));
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  console.log(`[db] DATABASE_URL=postgres://${user}:***@127.0.0.1:${port}/${database}`);
}

main().catch((error) => {
  console.error('[db] failed:', error);
  process.exit(1);
});
