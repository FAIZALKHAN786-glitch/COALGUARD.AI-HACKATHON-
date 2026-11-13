import { createDatabase } from '../src/db';
import { seedDevelopmentData } from '../src/dev-seed';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to load development fixture data with NODE_ENV=production.');
  }
  const db = createDatabase();
  try {
    const result = await seedDevelopmentData(db);
    console.log('Development fixture loaded:');
    for (const [name, count] of Object.entries(result.counts)) {
      console.log(`  ${name}: ${count}`);
    }
    console.log('All records are demonstration data (DATA_PROVENANCE=development).');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
