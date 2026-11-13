import { expect, test } from '@playwright/test';

import { IDENTITIES, signIn } from './helpers';

test.describe('role-based access control', () => {
  test('a field inspector cannot open administration', async ({ page }) => {
    await signIn(page, IDENTITIES.fieldInspector);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Access denied' })).toBeVisible();
    await expect(
      page.getByText('Your role cannot open Administration.', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText('Administration is restricted to system administrators.'),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Back to dashboard' }),
    ).toBeVisible();
  });

  test('a field inspector cannot open the audit trail', async ({ page }) => {
    await signIn(page, IDENTITIES.fieldInspector);
    await page.goto('/audit');
    await expect(page.getByRole('heading', { level: 1, name: 'Access denied' })).toBeVisible();
    await expect(page.getByText('Your role cannot open Audit trail.', { exact: false })).toBeVisible();
  });

  test('a field inspector never sees the report generation control', async ({ page }) => {
    await signIn(page, IDENTITIES.fieldInspector);
    await page.goto('/reports');
    await expect(page.getByRole('heading', { level: 1, name: 'Reporting centre' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate report' })).toHaveCount(0);
  });

  test('a regulatory observer cannot create records', async ({ page }) => {
    await signIn(page, IDENTITIES.regulatory);
    await page.goto('/mines');
    await expect(page.getByRole('heading', { level: 1, name: 'Mine register' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add mine' })).toHaveCount(0);
  });

  test('the public access-denied page explains the policy without leaking data', async ({ page }) => {
    await page.goto('/access-denied');
    await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
    await expect(page.getByText('Every access decision is recorded', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Return to dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Switch identity' })).toBeVisible();
  });

  test('direct detail URLs inherit the list route permission', async ({ page }) => {
    await signIn(page, IDENTITIES.fieldInspector);
    await page.goto('/analytics/ins-001');
    await expect(page.getByRole('heading', { level: 1, name: 'Access denied' })).toBeVisible();
    await expect(page.getByText('Your role cannot open AI risk analytics.', { exact: false })).toBeVisible();
  });
});
