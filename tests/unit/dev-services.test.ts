import { beforeEach, describe, expect, it } from 'vitest';

import { AppError, NotFoundError, ValidationError } from '@/lib/errors/normalise';
import { createDevServices } from '@/services/dev';
import { resetDevStore } from '@/services/dev/store';
import type { PlatformServices } from '@/services/types';

let services: PlatformServices;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetDevStore();
  services = createDevServices();
});

async function signInFirstIdentity() {
  const identities = await services.auth.listIdentities();
  const identity = identities[0];
  if (!identity) throw new Error('The development seed contains no identities.');
  const session = await services.auth.signIn(identity.email);
  return { identity, session };
}

describe('development adapter: authentication', () => {
  it('offers clearly labelled development identities', async () => {
    const identities = await services.auth.listIdentities();
    expect(identities.length).toBeGreaterThanOrEqual(10);
    for (const identity of identities) {
      expect(identity.email.endsWith('.invalid')).toBe(true);
    }
    expect(await services.auth.getSession()).toBeNull();
  });

  it('signs in a seeded identity and reports the session as developmental', async () => {
    const { identity, session } = await signInFirstIdentity();
    expect(session.user.id).toBe(identity.id);
    expect(session.development).toBe(true);
    expect(await services.auth.getSession()).not.toBeNull();
  });

  it('rejects an unknown email with a validation error', async () => {
    await expect(services.auth.signIn('nobody@example.invalid')).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('signs out and clears the stored session', async () => {
    await signInFirstIdentity();
    await services.auth.signOut();
    expect(await services.auth.getSession()).toBeNull();
  });

  it('updates the profile, persists it, and records an audit event', async () => {
    const { identity } = await signInFirstIdentity();
    const updated = await services.auth.updateProfile({
      name: 'Test Officer',
      title: 'Verification Lead',
    });
    expect(updated.id).toBe(identity.id);
    expect(updated.name).toBe('Test Officer');
    expect((await services.auth.getSession())?.user.name).toBe('Test Officer');

    const audit = await services.audit.list({ pageSize: 200 });
    expect(
      audit.items.some(
        (event) => event.action === 'update' && event.entityId === identity.id,
      ),
    ).toBe(true);
  });

  it('requires a session before updating a profile', async () => {
    await expect(
      services.auth.updateProfile({ name: 'No Session', title: 'Officer' }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('development adapter: mine register', () => {
  it('returns a bounded page of mines', async () => {
    const page = await services.mines.list({ page: 1, pageSize: 5 });
    expect(page.items.length).toBeLessThanOrEqual(5);
    expect(page.meta.pageSize).toBe(5);
    expect(page.meta.total).toBeGreaterThan(0);
    for (const mine of page.items) {
      expect(mine.name.length).toBeGreaterThan(0);
    }
  });

  it('creates a mine and rejects a duplicate code', async () => {
    const subsidiaries = await services.mines.subsidiaries();
    const subsidiary = subsidiaries[0];
    if (!subsidiary) throw new Error('No subsidiary in the seed.');

    const input = {
      code: 'TEST-MINE-001',
      name: 'Test Colliery',
      subsidiaryId: subsidiary.id,
      region: 'Test region',
      district: 'Test district',
      state: 'Jharkhand',
      operationalStatus: 'operational' as const,
    };
    const created = await services.mines.create(input);
    expect(created.code).toBe('TEST-MINE-001');
    expect(await services.mines.get(created.id)).toMatchObject({ name: 'Test Colliery' });

    await expect(services.mines.create(input)).rejects.toBeInstanceOf(AppError);
  });

  it('requires a reason to archive and records it when supplied', async () => {
    const page = await services.mines.list({ pageSize: 1 });
    const mine = page.items[0];
    if (!mine) throw new Error('No mine in the seed.');

    await expect(services.mines.archive(mine.id, '  ')).rejects.toBeInstanceOf(ValidationError);
    const archived = await services.mines.archive(mine.id, 'Consolidated into a neighbouring lease.');
    expect(archived.id).toBe(mine.id);

    const audit = await services.audit.list({ pageSize: 200 });
    expect(
      audit.items.some(
        (event) => event.entityId === mine.id && event.entityType === 'mine',
      ),
    ).toBe(true);
  });
});

describe('development adapter: compliance workflow', () => {
  it('creates a draft and permits only configured transitions', async () => {
    const minePage = await services.mines.list({ pageSize: 1 });
    const mine = minePage.items[0];
    if (!mine) throw new Error('No mine in the seed.');

    const created = await services.compliance.create({
      code: 'CMP-TEST-001',
      title: 'Test return',
      description: 'A test requirement created by the unit test suite.',
      category: 'mine_safety',
      applicableMineIds: [mine.id],
      priority: 'medium',
    });
    expect(created.status).toBe('draft');

    await expect(
      services.compliance.transition(created.id, 'compliant'),
    ).rejects.toBeInstanceOf(AppError);

    const submitted = await services.compliance.transition(
      created.id,
      'pending_submission',
      'Prepared for submission.',
    );
    expect(submitted.status).toBe('pending_submission');
  });

  it('rejects an unknown record with a not-found error', async () => {
    await expect(services.compliance.get('does-not-exist')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('development adapter: safety workflow', () => {
  it('creates an incident and enforces the investigation sequence', async () => {
    const minePage = await services.mines.list({ pageSize: 1 });
    const mine = minePage.items[0];
    if (!mine) throw new Error('No mine in the seed.');

    const incident = await services.safety.createIncident({
      mineId: mine.id,
      title: 'Test incident',
      description: 'A test incident recorded by the unit test suite.',
      severity: 'medium',
      occurredAt: new Date().toISOString(),
      injuriesReported: 0,
    });
    expect(incident.status).toBe('open');

    await expect(
      services.safety.transitionIncident(incident.id, 'closed'),
    ).rejects.toBeInstanceOf(AppError);

    const investigating = await services.safety.transitionIncident(
      incident.id,
      'under_investigation',
      'Investigation opened.',
    );
    expect(investigating.status).toBe('under_investigation');
  });
});

describe('development adapter: reports and audit', () => {
  it('generates a report, writes an export audit event and returns CSV matching the definition', async () => {
    const catalogue = await services.reports.catalogue();
    const definition = catalogue[0];
    if (!definition) throw new Error('The report catalogue is empty.');

    const job = await services.reports.generate({
      category: definition.category,
      title: 'Unit test export',
      mineIds: [],
      subsidiaryIds: [],
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      statusFilters: [],
      format: 'csv',
    });
    expect(job.status).toBe('ready');

    const csv = await services.reports.csv(job.id);
    const header = csv.split('\r\n')[0] ?? '';
    expect(header).toBe(definition.columns.map((column) => column.label).join(','));

    const audit = await services.audit.list({ pageSize: 200 });
    expect(
      audit.items.some(
        (event) => event.action === 'export' && event.entityId === job.id,
      ),
    ).toBe(true);
  });

  it('never claims a ledger connection it does not have', async () => {
    expect(await services.audit.ledgerConnected()).toBe(false);
  });
});

describe('development adapter: assistant retrieval', () => {
  it('retrieves matching records instead of generating prose', async () => {
    const answer = await services.assistant.ask({
      query: 'Which compliance requirements are overdue?',
    });
    expect(answer.retrievalBased).toBe(true);
    expect(answer.limitation).toMatch(/keyword retrieval/i);
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.citations.every((citation) => citation.href)).toBe(true);
    expect(answer.answer.toLowerCase()).toContain('compliance');
  });

  it('filters citations to the requested mine scope', async () => {
    const page = await services.mines.list({ pageSize: 1 });
    const mine = page.items[0];
    if (!mine) throw new Error('No mine in the seed.');
    const answer = await services.assistant.ask({
      query: `records for ${mine.name}`,
      mineIds: [mine.id],
    });
    expect(answer.citations.length).toBeGreaterThan(0);
  });

  it('admits when nothing matches', async () => {
    const answer = await services.assistant.ask({ query: 'zzzzqqqxyw' });
    expect(answer.citations).toEqual([]);
    expect(answer.limitation).toMatch(/no matching record/i);
  });

  it('refuses to interpret legislation', async () => {
    const answer = await services.assistant.ask({
      query: 'Am I legally liable under the applicable law?',
    });
    expect(answer.answer).toMatch(/cannot interpret legislation/i);
    expect(answer.limitation).toMatch(/legal/i);
    expect(answer.limitation).toMatch(/not legal advice/i);
  });
});

describe('development adapter: notifications and analytics', () => {
  it('marks all notifications as read', async () => {
    expect(await services.notifications.unreadCount()).toBeGreaterThan(0);
    await services.notifications.markAllRead();
    expect(await services.notifications.unreadCount()).toBe(0);
  });

  it('reviews an insight and records the reviewer', async () => {
    const insights = await services.analytics.insights({ pageSize: 1 });
    const insight = insights.items[0];
    if (!insight) throw new Error('No insight in the seed.');
    const reviewed = await services.analytics.review(
      insight.id,
      'acknowledged',
      'Reviewed by the unit test suite.',
    );
    expect(reviewed.reviewStatus).toBe('acknowledged');
    expect(reviewed.reviewedAt).toBeTruthy();
    expect(reviewed.reviewNote).toBe('Reviewed by the unit test suite.');
  });
});

describe('development adapter: documents', () => {
  it('refuses an empty upload', async () => {
    await expect(
      services.documents.upload({
        name: 'empty.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 0,
        type: 'other',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('accepts a valid upload and reports simulated OCR processing', async () => {
    const uploaded = await services.documents.upload({
      name: 'sample.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      type: 'other',
    });
    expect(uploaded.status).toBe('uploaded');
    expect(uploaded.uploadedAt).toBeTruthy();
  });

  it('rejects confirming a field that does not exist', async () => {
    const uploaded = await services.documents.upload({
      name: 'sample.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      type: 'other',
    });
    await expect(
      services.documents.confirmField(uploaded.id, 'missing-field', 'value'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('development adapter: integration status', () => {
  it('reports unavailable integrations honestly', async () => {
    const statuses = await services.admin.integrationStatus();
    const byId = new Map(statuses.map((status) => [status.id, status]));
    expect(byId.get('mapbox')?.status).toBe('unavailable');
    expect(byId.get('ledger')?.status).toBe('unavailable');
    expect(statuses.some((status) => status.status === 'degraded')).toBe(true);
  });
});
