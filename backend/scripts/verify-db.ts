import { verifyAuditChain } from '../src/audit';
import { createDatabase } from '../src/db';

async function main(): Promise<void> {
  const db = createDatabase();
  try {
    console.log(await verifyAuditChain(db.pool));
    const result = await db.query(`SELECT
      (SELECT count(*) FROM mines) AS mines,
      (SELECT count(*) FROM audit_events) AS audit_events,
      (SELECT count(*) FROM notifications) AS notifications,
      (SELECT count(*) FROM compliance_requirements) AS compliance`);
    console.log(result.rows[0]);
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
