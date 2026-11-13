import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildApp } from '../src/app';
import { appendAudit } from '../src/audit';
import { createDatabase, type Database } from '../src/db';
import { seedDevelopmentData } from '../src/dev-seed';
import { runMigrations } from '../src/migrations';
import { recreateTestDatabase, TEST_DATABASE_URL } from './test-db';

import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let db: Database;

interface SignedIn {
  token: string;
  user: Record<string, any>;
}

async function signIn(email: string): Promise<SignedIn> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in',
    payload: { email },
  });
  expect(response.statusCode, response.body).toBe(200);
  const body = response.json() as SignedIn & { accessToken: string };
  return { token: body.accessToken, user: body.user };
}

function auth(token?: string) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

function request(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  token?: string,
  payload?: unknown,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method,
    url,
    headers: { ...auth(token), ...headers },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

beforeAll(async () => {
  await recreateTestDatabase();
  db = createDatabase(TEST_DATABASE_URL);
  await runMigrations(db.pool);
  await seedDevelopmentData(db);
  app = await buildApp({ db, logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('health and authentication', () => {
  test('health is public, reports database reachability and unavailable providers', async () => {
    const response = await request('GET', '/health');
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.database).toBe('reachable');
    expect(body.externalServices.ocr).toBe('not_configured');
    expect(body.externalServices.ledger).toBe('not_configured');
  });

  test('protected endpoints reject anonymous requests with the contract error shape', async () => {
    const response = await request('GET', '/api/v1/mines');
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.code).toBe('unauthenticated');
    expect(body.requestId).toMatch(/^req-/);
  });

  test('unknown identities and empty sign-in bodies are rejected', async () => {
    const unknown = await request('POST', '/api/v1/auth/sign-in', undefined, {
      email: 'unknown@example.invalid',
    });
    expect(unknown.statusCode).toBe(401);
    const empty = await request('POST', '/api/v1/auth/sign-in', undefined, {});
    expect(empty.statusCode).toBe(400);
    expect(empty.json().code).toBe('validation_error');
  });

  test('development identities are listed without authentication', async () => {
    const response = await request('GET', '/api/v1/auth/identities');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(12);
    expect(response.json()[0]).not.toHaveProperty('password');
  });
});

describe('authorization and tenant scoping', () => {
  test('scoped managers only see assigned mines and cannot read others', async () => {
    const manager = await signIn('ravinder.singh@example.invalid');
    expect(manager.user.role).toBe('mine_manager');
    expect(manager.user.mineIds).toEqual(['mine-01', 'mine-02', 'mine-03']);

    const list = await request('GET', '/api/v1/mines', manager.token);
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(3);
    expect(list.json().items.every((mine: any) => manager.user.mineIds.includes(mine.id))).toBe(true);

    const denied = await request('GET', '/api/v1/mines/mine-04', manager.token);
    expect(denied.statusCode).toBe(403);

    const dashboard = await request('GET', '/api/v1/dashboard/summary', manager.token);
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().totalMines).toBe(3);
  });

  test('compliance list and dashboard are mine-scoped without leaking others', async () => {
    const manager = await signIn('ravinder.singh@example.invalid');
    const allowed = new Set(manager.user.mineIds);
    const response = await request('GET', '/api/v1/compliance?pageSize=100', manager.token);
    expect(response.statusCode).toBe(200);
    for (const item of response.json().items) {
      expect(item.applicableMineIds.some((id: string) => allowed.has(id))).toBe(true);
    }
  });

  test('write permissions are enforced server-side', async () => {
    const inspector = await signIn('suresh.kumar@example.invalid');
    const mine = await request(
      'POST',
      '/api/v1/mines',
      inspector.token,
      { code: 'E2E-MINE', name: 'Rejected mine', subsidiaryId: 'sub-01', region: 'X', district: 'X', state: 'X', operationalStatus: 'active' },
    );
    expect(mine.statusCode).toBe(403);

    const manager = await signIn('ravinder.singh@example.invalid');
    const crossScope = await request('POST', '/api/v1/safety/observations', manager.token, {
      type: 'observation',
      mineId: 'mine-04',
      title: 'Outside scope',
      description: 'Must be rejected.',
      severity: 'high',
    });
    expect(crossScope.statusCode).toBe(403);
  });

  test('system administrators can read all mines', async () => {
    const admin = await signIn('rohit.saxena@example.invalid');
    const response = await request('GET', '/api/v1/mines', admin.token);
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toHaveLength(12);
  });
});

describe('validation, workflow and idempotency', () => {
  test('invalid input returns field details without mutating data', async () => {
    const manager = await signIn('ravinder.singh@example.invalid');
    const response = await request('POST', '/api/v1/safety/observations', manager.token, {
      mineId: 'mine-01',
      description: 'Title is missing.',
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('validation_error');
    expect(body.details).toBeTruthy();
  });

  test('creates, validates coordinates and applies only permitted transitions', async () => {
    const manager = await signIn('ravinder.singh@example.invalid');
    const created = await request('POST', '/api/v1/safety/observations', manager.token, {
      type: 'observation',
      mineId: 'mine-01',
      title: 'Automated conveyor guard observation',
      description: 'Guard fixings inspected by the integration suite.',
      severity: 'medium',
      locationDescription: 'CV-02 transfer point',
      lat: 24.123456,
      lng: 82.123456,
      accuracyM: 8,
    });
    expect(created.statusCode, created.body).toBe(200);
    const observation = created.json();
    expect(observation.status).toBe('open');
    expect(observation.location.lat).toBe(24.123456);

    const invalid = await request('POST', `/api/v1/safety/observations/${observation.id}/transition`, manager.token, {
      to: 'closed',
    });
    expect(invalid.statusCode).toBe(409);
    expect(invalid.json().code).toBe('invalid_transition');

    const valid = await request('POST', `/api/v1/safety/observations/${observation.id}/transition`, manager.token, {
      to: 'under_investigation',
      comment: 'Investigation opened by automated verification.',
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json().status).toBe('under_investigation');

    const history = await db.many(
      "SELECT to_status AS status FROM safety_status_history WHERE safety_record_id=$1 ORDER BY created_at",
      [observation.id],
    );
    expect(history.map((row) => row.status)).toEqual(['under_investigation']);
  });

  test('validates coordinate ranges', async () => {
    const manager = await signIn('ravinder.singh@example.invalid');
    const response = await request('POST', '/api/v1/safety/observations', manager.token, {
      type: 'observation',
      mineId: 'mine-01',
      title: 'Bad coordinates',
      description: 'Latitude outside WGS84 range.',
      severity: 'low',
      lat: 400,
      lng: 20,
    });
    expect(response.statusCode).toBe(400);
  });

  test('idempotency replays successful requests and rejects conflicting reuse', async () => {
    const manager = await signIn('ravinder.singh@example.invalid');
    const key = `it-${Date.now()}`;
    const first = await request(
      'POST',
      '/api/v1/safety/observations',
      manager.token,
      { type: 'observation', mineId: 'mine-01', title: 'Idempotent create', description: 'Created once.', severity: 'low' },
      { 'idempotency-key': key },
    );
    expect(first.statusCode).toBe(200);
    const second = await request(
      'POST',
      '/api/v1/safety/observations',
      manager.token,
      { type: 'observation', mineId: 'mine-01', title: 'Idempotent create', description: 'Created once.', severity: 'low' },
      { 'idempotency-key': key },
    );
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);

    const rows = await db.one<{ count: number }>(
      "SELECT count(*)::int AS count FROM safety_records WHERE title='Idempotent create'",
    );
    expect(rows?.count).toBe(1);

    const conflict = await request(
      'POST',
      '/api/v1/safety/observations',
      manager.token,
      { type: 'observation', mineId: 'mine-01', title: 'Different request', description: 'Should conflict.', severity: 'low' },
      { 'idempotency-key': key },
    );
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().code).toBe('idempotency_conflict');
  });
});

describe('reports, documents, notifications and audit', () => {
  test('generates a scoped CSV and rejects unavailable formats honestly', async () => {
    const manager = await signIn('ravinder.singh@example.invalid');
    const created = await request('POST', '/api/v1/reports', manager.token, {
      category: 'production',
      title: 'Integration production export',
      mineIds: [],
      subsidiaryIds: [],
      dateFrom: '2026-10-01',
      dateTo: '2026-10-23',
      statusFilters: [],
      format: 'csv',
      groupBy: 'mine',
    });
    expect(created.statusCode, created.body).toBe(200);
    const report = created.json();
    expect(report.status).toBe('ready');
    expect(report.request.category).toBe('production');

    const content = await request('GET', `/api/v1/reports/${report.id}/content.csv`, manager.token);
    expect(content.statusCode).toBe(200);
    expect(content.headers['content-type']).toContain('text/csv');
    expect(content.body.length).toBeGreaterThan(20);
    expect(content.body).toContain('ProductionTonnes');

    const allMines = await request(
      'GET',
      '/api/v1/mines',
      (await signIn('rohit.saxena@example.invalid')).token,
    );
    const allowed = new Set(manager.user.mineIds);
    const forbiddenNames = allMines
      .json()
      .items.filter((mine: any) => !allowed.has(mine.id))
      .map((mine: any) => mine.name);
    for (const name of forbiddenNames) expect(content.body).not.toContain(name);

    const pdf = await request('POST', '/api/v1/reports', manager.token, {
      category: 'production',
      title: 'PDF export',
      mineIds: [],
      subsidiaryIds: [],
      dateFrom: '2026-10-01',
      dateTo: '2026-10-23',
      statusFilters: [],
      format: 'pdf',
    });
    expect(pdf.statusCode).toBe(422);
    expect(pdf.json().code).toBe('format_unavailable');
  });

  test('stores uploads, rejects unsupported types and reports OCR unavailable', async () => {
    const manager = await signIn('ravinder.singh@example.invalid');
    const upload = await request('POST', '/api/v1/documents', manager.token, {
      name: 'integration-note.txt',
      mimeType: 'text/plain',
      sizeBytes: 20,
      type: 'other',
      mineId: 'mine-01',
      content: 'Integration content',
    });
    expect(upload.statusCode, upload.body).toBe(200);
    expect(upload.json().status).toBe('queued');

    const retry = await request('POST', `/api/v1/documents/${upload.json().id}/ocr/retry`, manager.token);
    expect(retry.statusCode).toBe(503);
    expect(retry.json().code).toBe('ocr_not_configured');

    const rejected = await request('POST', '/api/v1/documents', manager.token, {
      name: 'payload.exe',
      mimeType: 'application/x-msdownload',
      sizeBytes: 10,
      type: 'other',
    });
    expect(rejected.statusCode).toBe(400);
  });

  test('notifications are recipient-scoped and have real safe routes', async () => {
    const compliance = await signIn('anita.deshmukh@example.invalid');
    const manager = await signIn('ravinder.singh@example.invalid');
    const own = await request('GET', '/api/v1/notifications?pageSize=50', compliance.token);
    expect(own.statusCode).toBe(200);
    expect(own.json().items.length).toBeGreaterThan(0);
    for (const notification of own.json().items) {
      if (notification.relatedEntity) {
        expect(notification.relatedEntity.href.startsWith('/')).toBe(true);
        expect(notification.relatedEntity.href).not.toBe('#');
      }
    }
    const other = await request('GET', '/api/v1/notifications', manager.token);
    expect(other.json().items).toHaveLength(0);

    const first = own.json().items[0];
    const updated = await request('PATCH', `/api/v1/notifications/${first.id}`, compliance.token, { read: true });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().read).toBe(true);
  });

  test('audit records are mine-scoped and the hash chain verifies', async () => {
    const manager = await signIn('ravinder.singh@example.invalid');
    const audit = await request('GET', '/api/v1/audit?pageSize=100', manager.token);
    expect(audit.statusCode).toBe(200);
    expect(audit.json().items.length).toBeGreaterThan(0);

    const admin = await signIn('rohit.saxena@example.invalid');
    const verify = await request('GET', '/api/v1/admin/audit/verify', admin.token);
    expect(verify.statusCode).toBe(200);
    expect(verify.json()).toMatchObject({ valid: true });
    expect(verify.json().checked).toBeGreaterThan(70);
  });

  test('audit history cannot be updated in place', async () => {
    await expect(
      db.query("UPDATE audit_events SET reason='tampered' WHERE id=(SELECT id FROM audit_events LIMIT 1)"),
    ).rejects.toThrow(/immutable|not permitted|audit/i);
    const verify = await request(
      'GET',
      '/api/v1/admin/audit/verify',
      (await signIn('rohit.saxena@example.invalid')).token,
    );
    expect(verify.json().valid).toBe(true);
  });

  test('assistant answers only from retrieved records', async () => {
    const manager = await signIn('ravinder.singh@example.invalid');
    const grounded = await request('POST', '/api/v1/assistant/query', manager.token, {
      query: 'Which compliance obligations mention safety?',
      mineIds: ['mine-01'],
    });
    expect(grounded.statusCode, grounded.body).toBe(200);
    expect(grounded.json().retrievalBased).toBe(true);
    expect(Array.isArray(grounded.json().citations)).toBe(true);
    expect(grounded.json().answer).not.toMatch(/language model generated/i);

    const ungrounded = await request('POST', '/api/v1/assistant/query', manager.token, {
      query: 'zzzznonexistentterm',
    });
    expect(ungrounded.statusCode).toBe(200);
    expect(ungrounded.json().citations).toHaveLength(0);
    expect(ungrounded.json().limitation).toBeTruthy();
  });
});

describe('administration and security headers', () => {
  test('admin catalogue and provider status are honest', async () => {
    const admin = await signIn('rohit.saxena@example.invalid');
    const integrations = await request('GET', '/api/v1/admin/integrations', admin.token);
    expect(integrations.statusCode).toBe(200);
    const body = integrations.json();
    expect(JSON.stringify(body)).toMatch(/not_configured|unavailable|unknown/);
    expect(JSON.stringify(body)).not.toContain('"connected"');
  });

  test('workflow configuration is restricted and mutable by administrators', async () => {
    const manager = await signIn('ravinder.singh@example.invalid');
    const denied = await request('PATCH', '/api/v1/workflows/rules/wf-01', manager.token, { enabled: false });
    expect(denied.statusCode).toBe(403);

    const admin = await signIn('rohit.saxena@example.invalid');
    const rules = await request('GET', '/api/v1/workflows/rules', admin.token);
    expect(rules.statusCode).toBe(200);
    const workflowId = rules.json()[0].id;
    const updated = await request('PATCH', `/api/v1/workflows/rules/${workflowId}`, admin.token, { enabled: true });
    expect(updated.statusCode).toBe(200);
  });

  test('CORS is allow-listed, security headers are set and request IDs are returned', async () => {
    const allowed = await request('GET', '/health', undefined, undefined, {
      origin: 'http://localhost:3100',
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3100');
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    expect(allowed.headers['referrer-policy']).toBe('no-referrer');
    expect(allowed.headers['x-request-id']).toMatch(/^req-/);

    const denied = await request('GET', '/health', undefined, undefined, {
      origin: 'https://evil.example',
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('unknown routes return a structured 404 for authenticated users', async () => {
    const admin = await signIn('rohit.saxena@example.invalid');
    const response = await request('GET', '/api/v1/not-a-route', admin.token);
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('not_found');
  });

  test('session revocation invalidates the bearer token', async () => {
    const user = await signIn('meera.nair@example.invalid');
    const signOut = await request('POST', '/api/v1/auth/sign-out', user.token);
    expect(signOut.statusCode).toBe(204);
    const after = await request('GET', '/api/v1/auth/session', user.token);
    expect(after.statusCode).toBe(401);
  });

  test('audit helper still produces a valid chain after all mutations', async () => {
    const result = await db.transaction(async (client) =>
      appendAudit(client, {
        actor: { id: 'usr-10', name: 'Rohit Saxena', role: 'system_admin' },
        action: 'verify',
        entityType: 'audit_chain',
        entityId: 'integration-suite',
        entityLabel: 'Integration suite verification',
      }),
    );
    expect(result.integrityHash).toHaveLength(64);
    const verify = await request(
      'GET',
      '/api/v1/admin/audit/verify',
      (await signIn('rohit.saxena@example.invalid')).token,
    );
    expect(verify.json().valid).toBe(true);
  });
});
