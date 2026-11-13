import { createHash, randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

export interface AuditActor {
  id: string;
  name: string;
  role: string;
  ipHash?: string;
}

export interface AuditInput {
  /** Set only by deterministic imports/tests; normal requests generate an id. */
  id?: string;
  actor: AuditActor;
  action:
    | 'create'
    | 'update'
    | 'status_change'
    | 'assign'
    | 'verify'
    | 'submit'
    | 'archive'
    | 'delete'
    | 'export'
    | 'login'
    | 'logout'
    | 'authorization_denied';
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  previousValue?: unknown;
  updatedValue?: unknown;
  reason?: string | null;
  workflow?: string | null;
  verificationMethod?: string | null;
  verifiedAt?: Date | string | null;
  source?: 'platform_log' | 'blockchain_ledger';
  ledgerNetwork?: string | null;
  ledgerTransactionId?: string | null;
  requestId?: string | null;
  mineIds?: string[];
  timestamp?: Date | string;
}

export interface AuditRecord {
  id: string;
  seq: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  previousValue: unknown;
  updatedValue: unknown;
  reason: string | null;
  workflow: string | null;
  verificationMethod: string | null;
  verifiedAt: string | null;
  source: string;
  ledgerNetwork: string | null;
  ledgerTransactionId: string | null;
  requestId: string | null;
  prevHash: string | null;
  integrityHash: string;
}

/** Deterministic JSON: object keys are sorted recursively. */
export function stableJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
    return JSON.stringify(value);
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function canonical(input: {
  prevHash: string | null;
  timestamp: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: unknown;
  updatedValue: unknown;
  reason: string | null;
  requestId: string | null;
}): string {
  return [
    input.prevHash ?? 'GENESIS',
    input.timestamp,
    input.actorId,
    input.action,
    input.entityType,
    input.entityId,
    stableJson(input.previousValue),
    stableJson(input.updatedValue),
    input.reason ?? '',
    input.requestId ?? '',
  ].join('|');
}

export function auditHash(input: Parameters<typeof canonical>[0]): string {
  return createHash('sha256').update(canonical(input)).digest('hex');
}

/**
 * Produces the JSON value exactly as PostgreSQL JSONB will return it. This
 * strips `undefined` object keys and converts dates before hashing so a record
 * can be independently re-verified from storage.
 */
function serialisable(value: unknown): unknown {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Appends an audit event inside the caller's transaction. A transaction-scoped
 * advisory lock serialises chain extension across API instances. The database
 * trigger independently rejects UPDATE, DELETE and TRUNCATE.
 */
export async function appendAudit(client: PoolClient, input: AuditInput): Promise<AuditRecord> {
  await client.query('SELECT pg_advisory_xact_lock($1)', [920_001_202_601]);
  const previous = await client.query<{ integrity_hash: string | null }>(
    'SELECT integrity_hash FROM audit_events ORDER BY seq DESC LIMIT 1',
  );
  const prevHash = previous.rows[0]?.integrity_hash ?? null;
  const timestamp = input.timestamp ? new Date(input.timestamp).toISOString() : new Date().toISOString();
  const reason = input.reason ?? null;
  const requestId = input.requestId ?? null;
  const previousValue = serialisable(input.previousValue);
  const updatedValue = serialisable(input.updatedValue);
  const hash = auditHash({
    prevHash,
    timestamp,
    actorId: input.actor.id,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    previousValue,
    updatedValue,
    reason,
    requestId,
  });
  const id = input.id ?? `aud-${randomUUID()}`;

  const result = await client.query(
    `INSERT INTO audit_events (
       id, timestamp, actor_id, actor_name, actor_role, action, entity_type,
       entity_id, entity_label, previous_value, updated_value, reason, workflow,
       verification_method, verified_at, source, ledger_network,
       ledger_transaction_id, request_id, ip_hash, prev_hash, integrity_hash
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13,
       $14, $15, $16, $17, $18, $19, $20, $21, $22
     ) RETURNING seq`,
    [
      id,
      timestamp,
      input.actor.id,
      input.actor.name,
      input.actor.role,
      input.action,
      input.entityType,
      input.entityId,
      input.entityLabel ?? null,
      previousValue === null ? null : JSON.stringify(previousValue),
      updatedValue === null ? null : JSON.stringify(updatedValue),      reason,
      input.workflow ?? null,
      input.verificationMethod ?? null,
      input.verifiedAt ? new Date(input.verifiedAt).toISOString() : null,
      input.source ?? 'platform_log',
      input.ledgerNetwork ?? null,
      input.ledgerTransactionId ?? null,
      requestId,
      input.actor.ipHash ?? null,
      prevHash,
      hash,
    ],
  );

  if (input.mineIds?.length) {
    const uniqueMines = [...new Set(input.mineIds)];
    await client.query(
      `INSERT INTO audit_event_mines (audit_id, mine_id)
       SELECT $1, mine_id FROM unnest($2::text[]) AS mine_id
       ON CONFLICT DO NOTHING`,
      [id, uniqueMines],
    );
  }

  return {
    id,
    seq: String(result.rows[0]?.seq ?? ''),
    timestamp,
    actorId: input.actor.id,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel ?? null,
    previousValue: input.previousValue ?? null,
    updatedValue: input.updatedValue ?? null,
    reason,
    workflow: input.workflow ?? null,
    verificationMethod: input.verificationMethod ?? null,
    verifiedAt: input.verifiedAt ? new Date(input.verifiedAt).toISOString() : null,
    source: input.source ?? 'platform_log',
    ledgerNetwork: input.ledgerNetwork ?? null,
    ledgerTransactionId: input.ledgerTransactionId ?? null,
    requestId,
    prevHash,
    integrityHash: hash,
  };
}

export interface AuditChainResult {
  valid: boolean;
  checked: number;
  brokenAt?: string;
}

/** Recomputes the chain from the database. Used by tests and the admin endpoint. */
export async function verifyAuditChain(client: PoolClient | { query: PoolClient['query'] }): Promise<AuditChainResult> {
  const result = await client.query<AuditRecord & { timestamp: Date }>(
    `SELECT id, seq::text, timestamp, actor_id AS "actorId", actor_name AS "actorName",
            actor_role AS "actorRole", action, entity_type AS "entityType",
            entity_id AS "entityId", previous_value AS "previousValue",
            updated_value AS "updatedValue", reason, request_id AS "requestId",
            prev_hash AS "prevHash", integrity_hash AS "integrityHash"
     FROM audit_events ORDER BY audit_events.seq ASC`,
  );
  let previous: string | null = null;
  let checked = 0;
  for (const row of result.rows) {
    const expected = auditHash({
      prevHash: previous,
      timestamp: new Date(row.timestamp).toISOString(),
      actorId: row.actorId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      previousValue: row.previousValue,
      updatedValue: row.updatedValue,
      reason: row.reason,
      requestId: row.requestId,
    });
    if (row.prevHash !== previous || row.integrityHash !== expected) {
      return { valid: false, checked, brokenAt: row.id };
    }
    previous = row.integrityHash;
    checked += 1;
  }
  return { valid: true, checked };
}
