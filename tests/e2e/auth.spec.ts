import { expect, test } from '@playwright/test';

import { IDENTITIES, signIn, signOut } from './helpers';

test.describe('authentication', () => {
  test('redirects an anonymous visitor to sign in and preserves the requested route', async ({
    page,
  }) => {
    await page.goto('/compliance');
    await expect(page).toHaveURL(/\/login\?next=%2Fcompliance$/);
    await expect(page.getByRole('heading', { name: /Sign in to CoalGuard/ })).toBeVisible();
  });

  test('labels the development identity provider honestly', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Development identity provider')).toBeVisible();
    await expect(
      page.getByText('No production identity provider is configured', { exact: false }),
    ).toBeVisible();
    await expect(page.getByText('Do not enter a real password here.')).toBeVisible();
  });

  test('rejects an identity that is not in the development directory', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('unknown.person@example.invalid');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Sign in failed' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('No development identity matches that email address.');
    await expect(page).toHaveURL(/\/login/);
  });

  test('requires an email address before calling the service', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Sign in failed' });
    await expect(alert).toContainText('Enter the email address of the identity you want to use.');
  });

  test('signs in, survives a reload and signs out again', async ({ page }) => {
    await signIn(page, IDENTITIES.complianceOfficer);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Governance dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Account menu for Anita Deshmukh/ })).toBeVisible();

    await signOut(page);
    await expect(page.getByRole('heading', { name: /Sign in to CoalGuard/ })).toBeVisible();
  });

  test('ignores an off-site next parameter (open redirect protection)', async ({ page }) => {
    await page.goto('/login?next=https%3A%2F%2Fevil.example%2Fsteal');
    await page.getByLabel('Email address').fill(IDENTITIES.systemAdmin);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(page.url()).not.toContain('evil.example');
  });

  test('ignores a protocol-relative next parameter', async ({ page }) => {
    await page.goto('/login?next=%2F%2Fevil.example%2Fsteal');
    await page.getByLabel('Email address').fill(IDENTITIES.systemAdmin);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(page.url()).not.toContain('evil.example');
  });

  test('honours an internal next parameter', async ({ page }) => {
    await page.goto('/login?next=%2Freports');
    await page.getByLabel('Email address').fill(IDENTITIES.complianceOfficer);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Reporting centre' })).toBeVisible();
  });
});
