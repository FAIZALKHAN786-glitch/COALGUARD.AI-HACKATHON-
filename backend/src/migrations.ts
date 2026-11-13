import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Pool } from 'pg';

const MIGRATION_LOCK_ID = 73_001_202_601;

export interface AppliedMigration {
  version: string;
  checksum: string;
  appliedAt: string;
}

export async function ensureMigrationTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      execution_ms integer NOT NULL DEFAULT 0
    )
  `);
}

export async function runMigrations(
  pool: Pool,
  migrationsDir = path.resolve(process.cwd(), 'migrations'),
): Promise<{ applied: string[]; skipped: string[] }> {
  await ensureMigrationTable(pool);
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql') && !file.endsWith('.down.sql'))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    const existing = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations',
    );
    const known = new Map(existing.rows.map((row) => [row.version, row.checksum]));

    for (const file of files) {
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = known.get(file);
      if (previous) {
        if (previous !== checksum) {
          throw new Error(
            `Migration ${file} has changed since it was applied (expected ${previous}, found ${checksum}). Create a new migration instead of editing applied history.`,
          );
        }
        skipped.push(file);
        continue;
      }

      const started = Date.now();
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, checksum, execution_ms) VALUES ($1, $2, $3)',
          [file, checksum, Date.now() - started],
        );
        await client.query('COMMIT');
        applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(
          `Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }

  return { applied, skipped };
}

export async function appliedMigrations(pool: Pool): Promise<AppliedMigration[]> {
  await ensureMigrationTable(pool);
  const result = await pool.query<AppliedMigration>(
    'SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version',
  );
  return result.rows;
}
