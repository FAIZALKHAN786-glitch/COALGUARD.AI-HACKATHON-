import { expect, test } from '@playwright/test';

import { IDENTITIES, signIn } from './helpers';

test.describe('performance smoke tests', () => {
  test('dashboard reaches an interactive state within budget and logs no errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });

    await signIn(page, IDENTITIES.systemAdmin);
    await page.waitForLoadState('networkidle');

    const timing = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      return {
        domContentLoaded: navigation?.domContentLoadedEventEnd ?? Number.POSITIVE_INFINITY,
        load: navigation?.loadEventEnd ?? Number.POSITIVE_INFINITY,
        nodes: document.querySelectorAll('*').length,
      };
    });

    expect(timing.domContentLoaded, 'DOMContentLoaded budget').toBeLessThan(6000);
    expect(timing.load, 'load budget').toBeLessThan(8000);
    expect(timing.nodes, 'DOM size budget').toBeLessThan(4000);

    await expect(page.getByRole('heading', { level: 1, name: 'Governance dashboard' })).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('primary list screens render without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      // Next.js logs an aborted route prefetch when the test navigates away
      // before a prefetch settles. That is test-induced network noise, not an
      // application error, so it is excluded narrowly rather than broadly.
      const isAbortedPrefetch =
        text.includes('Failed to fetch RSC payload') &&
        text.includes('Falling back to browser navigation');
      if (!isAbortedPrefetch) errors.push(`${page.url()}: ${text}`);
    });

    await signIn(page, IDENTITIES.systemAdmin);
    for (const path of ['/compliance', '/inspections', '/reports', '/assistant', '/audit']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('script payload for the dashboard stays within a documented budget', async ({ page }) => {
    await signIn(page, IDENTITIES.systemAdmin);

    const bytes = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return resources
        .filter((entry) => entry.name.includes('/_next/static/'))
        .reduce((total, entry) => total + (entry.transferSize || entry.encodedBodySize || 0), 0);
    });

    // Generous ceiling for the demo build; the budget exists so accidental
    // bundle regressions fail loudly rather than silently shipping.
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(6_000_000);
  });
});
