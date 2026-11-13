import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

import { config } from './config';

export interface Database {
  pool: Pool;
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
  one<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T | null>;
  many<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createDatabase(connectionString: string = config.databaseUrl): Database {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'coalguard-api',
  });
  pool.on('error', (error) => {
    // A pool-level error must never crash the process silently.
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'database_pool_error',
        message: error.message,
      }),
    );
  });

  return {
    pool,
    query: (sql, params) => pool.query(sql, params),
    one: async (sql, params) => {
      const result = await pool.query(sql, params);
      return (result.rows[0] as never) ?? null;
    },
    many: async (sql, params) => {
      const result = await pool.query(sql, params);
      return result.rows as never;
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export function iso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return value.toISOString();
}

export function dateOnly(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
