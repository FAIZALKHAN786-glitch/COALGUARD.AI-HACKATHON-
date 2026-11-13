import { createDatabase } from '../src/db';

const db = createDatabase();
const run = async () => {
  const types = await db.many<{ entity_type: string; count: number }>(
    'SELECT entity_type, count(*)::int AS count FROM audit_events GROUP BY entity_type ORDER BY entity_type',
  );
  console.log(types);
  await db.close();
};
void run();
