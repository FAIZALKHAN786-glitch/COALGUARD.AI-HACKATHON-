import { createDatabase } from '../src/db';

const db = createDatabase();
const run = async () => {
  console.log('report_jobs', await db.one('SELECT count(*)::int AS count FROM report_jobs'));
  console.log('notification recipients', await db.many('SELECT recipient_id, count(*)::int AS count FROM notifications GROUP BY recipient_id ORDER BY recipient_id'));
  await db.close();
};
void run();
