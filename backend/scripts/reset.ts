import { createDatabase } from '../src/db';
import { runMigrations } from '../src/migrations';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset a production database.');
  }
  if (process.env.ALLOW_DEV_SEED === 'false') {
    throw new Error('Refusing to reset: ALLOW_DEV_SEED is false.');
  }
  const db = createDatabase();
  try {
    console.warn('Dropping the public schema. This destroys every table in this database.');
    await db.query('DROP SCHEMA public CASCADE');
    await db.query('CREATE SCHEMA public');
    const result = await runMigrations(db.pool);
    console.log(`Recreated schema with ${result.applied.length} migration(s).`);
    console.log('Run `npm run db:seed` to load the development fixture.');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
