import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { IDENTITIES, signIn } from './helpers';

async function analyse(page: Page) {
  return new AxeBuilder({
    page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'],
  })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
}

function summarise(violations: Awaited<ReturnType<typeof analyse>>['violations']) {
  return violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help} — ${violation.nodes.length} node(s)`,
    )
    .join('\n');
}

test.describe('accessibility', () => {
  test('login page has no serious or critical WCAG violations', async ({ page }) => {
    await page.goto('/login');
    const results = await analyse(page);
    const serious = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(serious, summarise(serious)).toEqual([]);
  });

  const PAGES: { path: string; heading: string }[] = [
    { path: '/dashboard', heading: 'Governance dashboard' },
    { path: '/compliance', heading: 'Statutory compliance register' },
    { path: '/reports', heading: 'Reporting centre' },
    { path: '/assistant', heading: 'Assistant' },
    { path: '/map', heading: 'GIS map' },
    { path: '/admin', heading: 'Administration' },
    { path: '/profile', heading: 'Profile & access' },
  ];

  for (const entry of PAGES) {
    test(`${entry.path} has one main landmark, one h1 and no serious WCAG violations`, async ({
      page,
    }) => {
      await signIn(page, IDENTITIES.systemAdmin);
      await page.goto(entry.path);
      await expect(page.getByRole('heading', { level: 1, name: entry.heading })).toBeVisible();
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

      const results = await analyse(page);
      const serious = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(serious, summarise(serious)).toEqual([]);
    });
  }

  test('a keyboard user can skip straight to the main content', async ({ page }) => {
    await signIn(page, IDENTITIES.systemAdmin);
    await page.goto('/dashboard');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await skip.press('Enter');
    await expect(page).toHaveURL(/#main-content$/);
    await expect(page.locator('#main-content')).toBeVisible();
  });
});
