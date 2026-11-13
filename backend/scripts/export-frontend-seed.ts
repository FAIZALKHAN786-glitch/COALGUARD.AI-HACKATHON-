/**
 * Exports the deterministic frontend development dataset so the API seed can
 * use exactly the same records as the offline adapter. This keeps demo data
 * consistent across both integration modes. It is never run in production.
 *
 * Run from `backend/`:
 *   npm run seed:export
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createSeedDatabase } from '../../src/services/dev/seed';

async function main(): Promise<void> {
  const anchor = process.env.SEED_NOW ? new Date(process.env.SEED_NOW) : new Date();
  if (Number.isNaN(anchor.getTime())) {
    throw new Error('SEED_NOW must be a valid ISO date when supplied.');
  }
  const database = createSeedDatabase(anchor);
  const outDir = path.resolve(process.cwd(), 'seed');
  await mkdir(outDir, { recursive: true });
  const output = path.join(outDir, 'dev-seed.json');
  await writeFile(output, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
  console.log(
    `Wrote ${output} (${database.mines.length} mines, ${database.users.length} users, ${database.compliance.length} compliance requirements, ${database.inspections.length} inspections).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
