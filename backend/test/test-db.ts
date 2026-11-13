import { Client } from 'pg';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://postgres:postgres@127.0.0.1:55432/coalguard_test';

/** Recreates the isolated database used by the integration suite. */
export async function recreateTestDatabase(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!/^[a-z_][a-z0-9_]*$/.test(database) || !database.endsWith('_test')) {
    throw new Error(`Refusing to reset unexpected test database name: ${database}`);
  }
  const maintenance = new URL(TEST_DATABASE_URL);
  maintenance.pathname = '/postgres';
  const client = new Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
      [database],
    );
    await client.query(`DROP DATABASE IF EXISTS "${database}"`);
    await client.query(`CREATE DATABASE "${database}"`);
  } finally {
    await client.end();
  }
}
