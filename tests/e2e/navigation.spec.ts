import { expect, test } from '@playwright/test';

import { IDENTITIES, expectPageHeading, expectNoHorizontalOverflow, signIn } from './helpers';

const ROUTES: { path: string; heading: string }[] = [
  { path: '/dashboard', heading: 'Governance dashboard' },
  { path: '/mines', heading: 'Mine register' },
  { path: '/compliance', heading: 'Statutory compliance register' },
  { path: '/inspections', heading: 'Inspections' },
  { path: '/corrective-actions', heading: 'Corrective actions' },
  { path: '/safety', heading: 'Safety & incidents' },
  { path: '/safety/incidents', heading: 'Incidents' },
  { path: '/environment', heading: 'Environment' },
  { path: '/production', heading: 'Production' },
  { path: '/contractors', heading: 'Contractors' },
  { path: '/workforce', heading: 'Workforce records' },
  { path: '/documents', heading: 'Documents & OCR' },
  { path: '/analytics', heading: 'AI risk analytics' },
  { path: '/map', heading: 'GIS map' },
  { path: '/reports', heading: 'Reporting centre' },
  { path: '/notifications', heading: 'Notifications' },
  { path: '/audit', heading: 'Audit trail' },
  { path: '/assistant', heading: 'Assistant' },
  { path: '/admin', heading: 'Administration' },
  { path: '/profile', heading: 'Profile & access' },
];

test.describe('navigation and route rendering', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, IDENTITIES.systemAdmin);
  });

  for (const route of ROUTES) {
    test(`renders ${route.path} with a single h1`, async ({ page }) => {
      await page.goto(route.path);
      await expectPageHeading(page, route.heading);
      await expectNoHorizontalOverflow(page);
    });
  }

  test('navigates from the sidebar without a full page reload', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Governance dashboard' })).toBeVisible();

    const marker = await page.evaluate(() => {
      (window as unknown as { __spaMarker?: number }).__spaMarker = Date.now();
      return (window as unknown as { __spaMarker?: number }).__spaMarker;
    });

    await page.getByRole('link', { name: /Statutory compliance/ }).first().click();
    await expect(page).toHaveURL(/\/compliance$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Statutory compliance register' })).toBeVisible();

    const after = await page.evaluate(
      () => (window as unknown as { __spaMarker?: number }).__spaMarker,
    );
    expect(after).toBe(marker);
  });

  test('opens global search from the keyboard and finds a mine', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Governance dashboard' })).toBeVisible();
    await page.keyboard.press('/');
    const search = page.getByRole('combobox', { name: 'Search platform records' });
    await expect(search).toBeVisible();
    await search.fill('Rajmahal');
    await expect(page.getByRole('option').first()).toBeVisible({ timeout: 15_000 });
    const options = page.getByRole('option');
    expect(await options.count()).toBeGreaterThan(0);
    await options.first().click();
    await expect(page).not.toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('shows a truthful data-source badge', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Demonstration dataset')).toBeVisible();
    await expect(page.getByText('Development identity provider.')).toBeVisible();
    await expect(page.getByText('They are not production credentials', { exact: false })).toBeVisible();
  });
});
