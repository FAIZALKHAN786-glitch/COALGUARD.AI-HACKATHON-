import { createDatabase } from '../src/db';
import { runMigrations } from '../src/migrations';

async function main(): Promise<void> {
  const db = createDatabase();
  try {
    const result = await runMigrations(db.pool);
    console.log(
      result.applied.length
        ? `Applied migrations:\n  ${result.applied.join('\n  ')}`
        : 'No pending migrations.',
    );
    if (result.skipped.length) {
      console.log(`Already applied: ${result.skipped.length} migration(s).`);
    }
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
