/**
 * Idempotent maintenance tick.
 *
 * This build has no external message broker or OCR worker. The tick performs
 * only storage housekeeping and package-level verification; it never pretends
 * to deliver messages or process OCR. Schedule it externally (for example a
 * platform cron job) once a deployment target is agreed.
 */
import { verifyAuditChain } from '../src/audit';
import { createDatabase } from '../src/db';

async function main(): Promise<void> {
  const db = createDatabase();
  try {
    const sessions = await db.query(
      "DELETE FROM user_sessions WHERE expires_at < now() - interval '7 days' OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days')",
    );
    const idempotency = await db.query(
      "DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'",
    );
    const chain = await verifyAuditChain(db);
    console.log(
      JSON.stringify({
        expiredSessionsRemoved: sessions.rowCount ?? 0,
        idempotencyKeysRemoved: idempotency.rowCount ?? 0,
        auditChain: chain,
        messaging: 'not_configured',
        ocr: 'not_configured',
      }),
    );
    if (!chain.valid) process.exitCode = 1;
  } finally {
    await db.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
