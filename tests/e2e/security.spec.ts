import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { IDENTITIES, signIn } from './helpers';

const SOURCE_ROOT = join(process.cwd(), 'src');

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

test.describe('security controls', () => {
  test('contains no dead links, raw HTML injection or dynamic code execution', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SOURCE_ROOT)) {
      const source = readFileSync(file, 'utf8');
      const relative = file.replace(process.cwd(), '').replace(/\\/g, '/');
      for (const [pattern, reason] of [
        [/href="#"/, 'placeholder href="#"'],
        [/dangerouslySetInnerHTML/, 'raw HTML injection surface'],
        [/javascript:/i, 'javascript: URL'],
        [/\beval\s*\(/, 'eval'],
        [/new Function\s*\(/, 'dynamic function construction'],
      ] as const) {
        if (pattern.test(source)) offenders.push(`${relative}: ${reason}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test('does not expose protected content before authentication', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
    await expect(page.getByText('Administration', { exact: true })).toHaveCount(0);
  });

  test('renders a hostile assistant question as literal text, not markup', async ({ page }) => {
    let dialogOpened = false;
    page.on('dialog', async (dialog) => {
      dialogOpened = true;
      await dialog.dismiss();
    });

    await signIn(page, IDENTITIES.complianceOfficer);
    await page.goto('/assistant');

    const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
    await page.getByLabel('Your question').fill(payload);
    await page.getByRole('button', { name: 'Ask', exact: true }).click();

    await expect(page.getByText(payload, { exact: false })).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(dialogOpened).toBe(false);
  });

  test('does not render hostile search input as markup', async ({ page }) => {
    await signIn(page, IDENTITIES.systemAdmin);
    await page.goto('/mines');
    const payload = '<img src=x onerror="window.__xss=3">';
    await page.getByPlaceholder('Search by mine name, code or district').fill(payload);
    await expect(page.getByText('No mines match the current filters')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });

  test('does not leak the signed-in identity to the login page', async ({ page }) => {
    await signIn(page, IDENTITIES.systemAdmin);
    await page.goto('/login');
    // The login form is public; it must not pre-fill or reveal the current session.
    await expect(page.getByLabel('Email address')).toHaveValue('');
    await expect(page.getByRole('button', { name: /Account menu for/ })).toHaveCount(0);
  });
});
