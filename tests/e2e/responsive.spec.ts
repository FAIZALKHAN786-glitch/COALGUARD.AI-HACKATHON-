import { expect, test } from '@playwright/test';

import { IDENTITIES, expectNoHorizontalOverflow, signIn } from './helpers';

test.describe('responsive layout (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the login page is usable without horizontal scrolling', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('the dashboard reflows without horizontal scrolling', async ({ page }) => {
    await signIn(page, IDENTITIES.systemAdmin);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Governance dashboard' })).toBeVisible();
  });

  test('the mobile drawer navigates between modules', async ({ page }) => {
    await signIn(page, IDENTITIES.systemAdmin);
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('link', { name: /Statutory compliance/ }).click();
    await expect(page).toHaveURL(/\/compliance$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Statutory compliance register' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('list screens present cards instead of a scrollable table', async ({ page }) => {
    await signIn(page, IDENTITIES.systemAdmin);
    await page.goto('/compliance');
    await expect(page.getByRole('heading', { level: 1, name: 'Statutory compliance register' })).toBeVisible();
    await expect(page.locator('table').first()).toBeHidden();
    await expect(page.locator('ul.divide-y').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('the reporting centre and assistant remain usable', async ({ page }) => {
    await signIn(page, IDENTITIES.systemAdmin);

    await page.goto('/reports');
    await expect(page.getByRole('heading', { level: 1, name: 'Reporting centre' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/assistant');
    await expect(page.getByLabel('Your question')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('responsive layout (768×1024)', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('the table view is shown from the medium breakpoint', async ({ page }) => {
    await signIn(page, IDENTITIES.systemAdmin);
    await page.goto('/compliance');
    await expect(page.locator('table').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
