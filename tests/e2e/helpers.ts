import { expect, type Page } from '@playwright/test';

/** Seeded development identities (documented in the seed and on the login page). */
export const IDENTITIES = {
  complianceOfficer: 'anita.deshmukh@example.invalid',
  mineManager: 'ravinder.singh@example.invalid',
  safetyOfficer: 'meera.nair@example.invalid',
  fieldInspector: 'suresh.kumar@example.invalid',
  corporate: 'nandini.rao@example.invalid',
  regulatory: 'vikram.chatterjee@example.invalid',
  systemAdmin: 'rohit.saxena@example.invalid',
} as const;

/** Signs in through the real login form and waits for the dashboard. */
export async function signIn(page: Page, email: string = IDENTITIES.systemAdmin): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 2, name: /Sign in to CoalGuard/ })).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Governance dashboard' })).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Account menu for/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Asserts the page has exactly one h1 carrying the expected accessible name. */
export async function expectPageHeading(page: Page, name: string | RegExp): Promise<void> {
  const headings = page.getByRole('heading', { level: 1 });
  await expect(headings).toHaveCount(1);
  await expect(headings).toHaveAccessibleName(name);
}

/** Asserts the document never scrolls horizontally at its current viewport. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    overflow.scrollWidth,
    `Document scroll width ${overflow.scrollWidth}px exceeds viewport ${overflow.innerWidth}px`,
  ).toBeLessThanOrEqual(overflow.innerWidth + 1);
}
