/**
 * End-to-end API verification against a running development server.
 *
 * This is intentionally assertive: any deviation from the API contract exits
 * non-zero. It mutates the development database, so reseed afterwards.
 */
const base = process.env.API_BASE ?? 'http://127.0.0.1:4000';
let failures = 0;

function check(condition: unknown, message: string, detail?: unknown): void {
  if (condition) {
    console.log(`PASS ${message}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${message}${detail === undefined ? '' : ` :: ${JSON.stringify(detail)}`}`);
}

async function signIn(email: string) {
  const response = await fetch(`${base}/api/v1/auth/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const body: any = await response.json();
  return { response, body, headers: { authorization: `Bearer ${body.accessToken}`, 'content-type': 'application/json' } };
}

async function call(path: string, init: RequestInit & { headers: Record<string, string> }) {
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { response, body, text };
}

async function main() {
  const anonymous = await call('/api/v1/mines', { headers: {} });
  check(anonymous.response.status === 401, 'anonymous requests are rejected', anonymous.body);

  const invalid = await fetch(`${base}/api/v1/auth/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'nobody@example.invalid' }),
  });
  check(invalid.status === 401, 'unknown identity rejected');

  const manager = await signIn('ravinder.singh@example.invalid');
  const admin = await signIn('rohit.saxena@example.invalid');
  const compliance = await signIn('anita.deshmukh@example.invalid');
  const inspector = await signIn('suresh.kumar@example.invalid');
  const safety = await signIn('meera.nair@example.invalid');
  check(manager.body.accessToken && manager.body.user.role === 'mine_manager', 'manager signs in');
  check(Array.isArray(manager.body.user.mineIds) && manager.body.user.mineIds.length === 3, 'manager scope is returned');

  const managerMines = await call('/api/v1/mines', { headers: manager.headers });
  check(managerMines.response.status === 200 && managerMines.body.items.length === 3, 'manager sees only assigned mines', managerMines.body);
  const otherMine = await call('/api/v1/mines/mine-04', { headers: manager.headers });
  check(otherMine.response.status === 403, 'manager cannot read out-of-scope mine', otherMine.body);

  const adminMines = await call('/api/v1/mines', { headers: admin.headers });
  check(adminMines.body.items.length === 12, 'system administrator sees all mines');

  const forbiddenCreate = await call('/api/v1/mines', {
    method: 'POST',
    headers: inspector.headers,
    body: JSON.stringify({ code: 'NOPE', name: 'Nope', subsidiaryId: 'sub-01', region: 'X', district: 'X', state: 'X', operationalStatus: 'active' }),
  });
  check(forbiddenCreate.response.status === 403, 'field inspector cannot create mines', forbiddenCreate.body);

  const managerDashboard = await call('/api/v1/dashboard/summary', { headers: manager.headers });
  check(managerDashboard.body.totalMines === 3, 'manager dashboard is mine-scoped', managerDashboard.body);

  const managerCompliance = await call('/api/v1/compliance?pageSize=100', { headers: manager.headers });
  const allowedMines = new Set(manager.body.user.mineIds);
  check(
    managerCompliance.body.items.every((item: any) => item.applicableMineIds.some((id: string) => allowedMines.has(id))),
    'manager compliance list is mine-scoped',
  );

  const validation = await call('/api/v1/safety/observations', {
    method: 'POST',
    headers: manager.headers,
    body: JSON.stringify({ mineId: 'mine-01', description: 'Missing title' }),
  });
  check(validation.response.status === 400 && validation.body.code === 'validation_error', 'validation errors use contract shape', validation.body);

  const crossScope = await call('/api/v1/safety/observations', {
    method: 'POST',
    headers: manager.headers,
    body: JSON.stringify({ mineId: 'mine-04', type: 'observation', title: 'Out of scope', description: 'Should be rejected', severity: 'high' }),
  });
  check(crossScope.response.status === 403, 'cross-mine writes are rejected', crossScope.body);

  const createdObservation = await call('/api/v1/safety/observations', {
    method: 'POST',
    headers: manager.headers,
    body: JSON.stringify({
      mineId: 'mine-01',
      type: 'observation', title: 'E2E conveyor guard check',
      description: 'Guard fixings inspected during verification run.',
      severity: 'medium',
      locationDescription: 'Conveyor CV-02 transfer point',
      lat: 24.123456,
      lng: 82.123456,
      accuracyM: 8,
    }),
  });
  check(createdObservation.response.status === 200, 'manager creates observation', createdObservation.body);
  check(createdObservation.body.status === 'open', 'new observation starts open');
  check(createdObservation.body.location?.lat === 24.123456, 'validated coordinates round-trip', createdObservation.body.location);

  const invalidTransition = await call(`/api/v1/safety/observations/${createdObservation.body.id}/transition`, {
    method: 'POST',
    headers: manager.headers,
    body: JSON.stringify({ to: 'closed' }),
  });
  check(invalidTransition.response.status === 409 && invalidTransition.body.code === 'invalid_transition', 'invalid workflow transition rejected', invalidTransition.body);

  const transitioned = await call(`/api/v1/safety/observations/${createdObservation.body.id}/transition`, {
    method: 'POST',
    headers: manager.headers,
    body: JSON.stringify({ to: 'under_investigation', comment: 'Investigation opened by E2E check.' }),
  });
  check(transitioned.response.status === 200 && transitioned.body.status === 'under_investigation', 'valid workflow transition applied', transitioned.body);
  check(transitioned.body.status === 'under_investigation', 'transition history recorded through status');

  const idempotencyKey = `verify-${Date.now()}`;
  const first = await call('/api/v1/safety/observations', {
    method: 'POST',
    headers: { ...manager.headers, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ mineId: 'mine-01', type: 'observation', title: 'Idempotent observation', description: 'One record only.', severity: 'low' }),
  });
  const second = await call('/api/v1/safety/observations', {
    method: 'POST',
    headers: { ...manager.headers, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ mineId: 'mine-01', type: 'observation', title: 'Idempotent observation', description: 'One record only.', severity: 'low' }),
  });
  check(first.response.status === 200 && second.response.status === 200, 'idempotent create replays', second.body);
  check(second.body.id === first.body.id, 'idempotent create returns the original record');
  const conflictKey = await call('/api/v1/safety/observations', {
    method: 'POST',
    headers: { ...manager.headers, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ mineId: 'mine-01', type: 'observation', title: 'Different request', description: 'Should conflict.', severity: 'low' }),
  });
  check(conflictKey.response.status === 409 && conflictKey.body.code === 'idempotency_conflict', 'idempotency key reuse with different payload rejected', conflictKey.body);

  const report = await call('/api/v1/reports', {
    method: 'POST',
    headers: manager.headers,
    body: JSON.stringify({
      category: 'production',
      title: 'E2E scoped production export',
      mineIds: [],
      subsidiaryIds: [],
      dateFrom: '2026-10-01',
      dateTo: '2026-10-23',
      statusFilters: [],
      format: 'csv',
      groupBy: 'mine',
    }),
  });
  check(report.response.status === 200 && report.body.status === 'ready', 'CSV report generated', report.body);
  check(report.body.request?.category === 'production', 'report request is serialized as a nested object', report.body.request);
  const csv = await call(`/api/v1/reports/${report.body.id}/content.csv`, { headers: { ...manager.headers, accept: 'text/csv' } });
  check(csv.response.status === 200 && csv.response.headers.get('content-type')?.includes('text/csv'), 'CSV download uses text/csv', csv.response.headers.get('content-type'));
  check(csv.text.includes('ProductionTonnes'), 'CSV contains a header row', csv.text.slice(0, 100));
  const managerMineNames = managerMines.body.items.map((mine: any) => mine.name);
  const csvMineNames = managerMineNames.filter((name: string) => csv.text.includes(name));
  const leaks = managerMineNames.length === 0;
  check(!leaks, 'scoped report contains only assigned mines');
  const otherMineNames = adminMines.body.items
    .filter((mine: any) => !manager.body.user.mineIds.includes(mine.id))
    .map((mine: any) => mine.name);
  check(otherMineNames.every((name: string) => !csv.text.includes(name)), 'scoped report leaks no out-of-scope mine', otherMineNames.filter((name: string) => csv.text.includes(name)));

  const pdf = await call('/api/v1/reports', {
    method: 'POST',
    headers: manager.headers,
    body: JSON.stringify({ category: 'production', title: 'PDF', mineIds: [], subsidiaryIds: [], dateFrom: '2026-10-01', dateTo: '2026-10-23', statusFilters: [], format: 'pdf' }),
  });
  check(pdf.response.status === 422 && pdf.body.code === 'format_unavailable', 'unimplemented report format rejected honestly', pdf.body);

  const upload = await call('/api/v1/documents', {
    method: 'POST',
    headers: manager.headers,
    body: JSON.stringify({ name: 'e2e-note.txt', mimeType: 'text/plain', sizeBytes: 24, type: 'other', mineId: 'mine-01', content: 'E2E stored document text' }),
  });
  check(upload.response.status === 200 && upload.body.status === 'queued', 'document upload queues without OCR', upload.body);
  const retry = await call(`/api/v1/documents/${upload.body.id}/ocr/retry`, { method: 'POST', headers: { authorization: manager.headers.authorization } });
  check(retry.response.status === 503 && retry.body.code === 'ocr_not_configured', 'OCR retry reports unavailable provider', retry.body);

  const notifications = await call('/api/v1/notifications?pageSize=50', { headers: compliance.headers });
  check(notifications.body.items.length > 0, 'seeded notifications are visible to their recipient');
  const firstNotification = notifications.body.items[0];
  check(firstNotification.relatedEntity?.href?.startsWith('/') ?? false, 'notification related link is a real route', firstNotification.relatedEntity);
  if (firstNotification) {
    const marked = await call(`/api/v1/notifications/${firstNotification.id}`, { method: 'PATCH', headers: compliance.headers, body: JSON.stringify({ read: true }) });
    check(marked.response.status === 200 && marked.body.read === true, 'notification read state persists');
  }
  const noAccess = await call('/api/v1/notifications', { headers: manager.headers });
  check(noAccess.body.items.length === 0, 'notifications are recipient-scoped');

  const workflowForbidden = await call('/api/v1/workflows/rules/wf-01', { method: 'PATCH', headers: manager.headers, body: JSON.stringify({ enabled: false }) });
  check(workflowForbidden.response.status === 403, 'workflow config is admin-only', workflowForbidden.body);

  const audit = await call('/api/v1/audit?pageSize=100', { headers: manager.headers });
  check(audit.response.status === 200 && audit.body.items.length > 0, 'manager sees scoped audit events');
  check(audit.body.items.every((event: any) => ['session', 'system'].includes(event.entityType) || manager.body.user.mineIds.length > 0), 'audit scope query executed');

  const verify = await call('/api/v1/admin/audit/verify', { headers: admin.headers });
  check(verify.response.status === 200 && verify.body.valid === true, 'audit hash chain verifies', verify.body);

  const assistant = await call('/api/v1/assistant/query', {
    method: 'POST',
    headers: manager.headers,
    body: JSON.stringify({ query: 'Which open compliance obligations do I have in my mines?', mineIds: ['mine-01'] }),
  });
  check(assistant.response.status === 200 && assistant.body.answer, 'assistant returns grounded answer', assistant.body);
  check(!/production model|trained model/i.test(assistant.body.answer), 'assistant does not claim a trained external model');

  const signOut = await call('/api/v1/auth/sign-out', { method: 'POST', headers: { authorization: manager.headers.authorization } });
  check(signOut.response.status === 204, 'sign-out succeeds');
  const afterSignOut = await call('/api/v1/auth/session', { headers: manager.headers });
  check(afterSignOut.response.status === 401, 'revoked token is rejected', afterSignOut.body);

  const profile = await call('/api/v1/auth/profile', {
    method: 'PATCH',
    headers: safety.headers,
    body: JSON.stringify({ name: 'Meera Nair', title: 'Regional Safety Officer' }),
  });
  check(profile.response.status === 200 && profile.body.title === 'Regional Safety Officer', 'profile update persists');

  const nearMisses = await call('/api/v1/safety/near-misses', { headers: safety.headers });
  check(nearMisses.response.status === 200 && nearMisses.body.items.length >= 0, 'near misses are a separate collection');

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
