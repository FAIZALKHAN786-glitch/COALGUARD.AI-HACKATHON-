const base = process.env.API_BASE ?? 'http://127.0.0.1:4000';

async function main() {
  const signIn = await fetch(`${base}/api/v1/auth/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.EMAIL ?? 'anita.deshmukh@example.invalid' }),
  });
  const session: any = await signIn.json();
  if (!signIn.ok) throw new Error(`sign-in failed: ${JSON.stringify(session)}`);
  const headers = { authorization: `Bearer ${session.accessToken}` };
  const paths = [
    '/api/v1/auth/session',
    '/api/v1/auth/identities',
    '/api/v1/mines',
    '/api/v1/subsidiaries',
    '/api/v1/users',
    '/api/v1/compliance',
    '/api/v1/compliance/calendar',
    '/api/v1/inspections',
    '/api/v1/safety/observations',
    '/api/v1/safety/incidents',
    '/api/v1/safety/near-misses',
    '/api/v1/environment/indicators',
    '/api/v1/environment/measurements',
    '/api/v1/environment/thresholds',
    '/api/v1/production/records',
    '/api/v1/production/anomalies',
    '/api/v1/production/completeness',
    '/api/v1/contractors',
    '/api/v1/contracts',
    '/api/v1/workforce/attendance',
    '/api/v1/corrective-actions',
    '/api/v1/documents',
    '/api/v1/analytics/insights',
    '/api/v1/analytics/risk-distribution',
    '/api/v1/notifications',
    '/api/v1/notifications/unread-count',
    '/api/v1/workflows/rules',
    '/api/v1/reports/catalogue',
    '/api/v1/reports',
    '/api/v1/audit',
    '/api/v1/audit/ledger-status',
    '/api/v1/dashboard/summary',
    '/api/v1/dashboard/trends/compliance',
    '/api/v1/dashboard/trends/production',
    '/api/v1/dashboard/mine-comparison',
    '/api/v1/dashboard/risk-distribution',
    '/api/v1/search?q=mine',
    '/api/v1/admin/users',
    '/api/v1/admin/reference-data',
    '/api/v1/admin/integrations',
    '/api/v1/admin/audit/verify',
  ];
  let failures = 0;
  for (const path of paths) {
    try {
      const response = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(15_000) });
      const text = await response.text();
      if (!response.ok) failures += 1;
      console.log(`${response.status} ${path} :: ${text.slice(0, 180)}`);
    } catch (error) {
      failures += 1;
      console.log(`ERR ${path} :: ${(error as Error).message}`);
    }
  }
  console.log(`failures=${failures}`);
  process.exitCode = failures ? 1 : 0;
}

void main();
