import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

import { IDENTITIES, signIn } from './helpers';

test.describe('core workflows', () => {
  test('creates a mine through the real form and finds it in the register', async ({ page }) => {
    await signIn(page, IDENTITIES.systemAdmin);
    await page.goto('/mines');
    await expect(page.getByRole('heading', { level: 1, name: 'Mine register' })).toBeVisible();

    const suffix = Date.now().toString(36).toUpperCase();
    const code = `E2E-${suffix}`;
    const name = `E2E Verification Colliery ${suffix}`;

    await page.getByRole('button', { name: 'Add mine' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Add a mine' })).toBeVisible();

    await dialog.getByLabel('Mine code').fill(code);
    await dialog.getByLabel('Mine name').fill(name);
    await dialog.getByLabel('Region').fill('Jharkhand');
    await dialog.getByLabel('District').fill('Dhanbad');
    await dialog.getByLabel('State').fill('Jharkhand');

    await dialog.getByRole('button', { name: 'Create mine' }).click();

    // A successful create navigates straight to the new record.
    await expect(page).toHaveURL(/\/mines\/[^/]+$/);
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible();

    await page.goto('/mines');
    await page.getByPlaceholder('Search by mine name, code or district').fill(code);
    await expect(page.getByText(code).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(name).first()).toBeVisible();
  });

  test('rejects an empty mine form with field-level messages', async ({ page }) => {
    await signIn(page, IDENTITIES.systemAdmin);
    await page.goto('/mines');
    await page.getByRole('button', { name: 'Add mine' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Mine code').fill('');
    await dialog.getByRole('button', { name: 'Create mine' }).click();
    await expect(dialog.getByText('Mine code is required.').first()).toBeVisible();
    await expect(dialog.getByText('Mine name is required.').first()).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create mine' })).toBeEnabled();
  });

  test('moves a draft compliance requirement through the permitted transition', async ({ page }) => {
    await signIn(page, IDENTITIES.complianceOfficer);
    await page.goto('/compliance');

    const draftId = await page.evaluate(() => {
      const raw = window.localStorage.getItem('coalguard.devdb.v1');
      if (!raw) return null;
      const database = JSON.parse(raw) as {
        compliance: { id: string; status: string }[];
      };
      return database.compliance.find((record) => record.status === 'draft')?.id ?? null;
    });
    expect(draftId, 'the seed should contain a draft compliance requirement').toBeTruthy();
    if (!draftId) return;

    await page.goto(`/compliance/${draftId}`);
    await expect(page.getByText('Update status', { exact: true })).toBeVisible();

    const option = page.getByRole('radio', { name: /Pending submission/ });
    await expect(option).toBeVisible();
    await option.check();
    await page.getByRole('button', { name: 'Move to Pending submission' }).click();

    await expect(page.getByText('Status changed to Pending submission.')).toBeVisible();
    // The badge renders a decorative marker inside the same element, so match
    // its label as a substring rather than an exact text node.
    await expect(page.getByText(/Pending submission/).first()).toBeVisible();
  });

  test('generates a report and downloads a CSV payload', async ({ page }) => {
    await signIn(page, IDENTITIES.systemAdmin);
    await page.goto('/reports');
    await expect(page.getByRole('heading', { level: 1, name: 'Reporting centre' })).toBeVisible();

    const title = `E2E report ${Date.now().toString(36)}`;
    await page.getByRole('button', { name: 'Generate report' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Generate a report' })).toBeVisible();

    await dialog.getByLabel('Report title').fill(title);
    await dialog.getByLabel('Period start').fill('2026-01-01');
    await dialog.getByLabel('Period end').fill('2026-12-31');
    await dialog.getByRole('button', { name: 'Generate report' }).click();

    await expect(page.getByText(`Report "${title}" was generated.`)).toBeVisible();
    await expect(dialog).toHaveCount(0);

    const downloadButton = page
      .getByRole('button', { name: new RegExp(`Download ${title} as CSV`, 'i') })
      .first();
    await expect(downloadButton).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);

    const path = await download.path();
    expect(path).toBeTruthy();
    if (!path) return;
    const content = await readFile(path, 'utf8');
    expect(content).toContain('\uFEFF');
    expect(content.split('\r\n')[0]?.length ?? 0).toBeGreaterThan(0);
    await expect(page.getByText('Report downloaded as CSV')).toBeVisible();
  });

  test('asks the assistant a grounded question and shows citations', async ({ page }) => {
    await signIn(page, IDENTITIES.complianceOfficer);
    await page.goto('/assistant');
    await expect(page.getByRole('heading', { level: 1, name: 'Assistant' })).toBeVisible();

    await page
      .getByRole('button', { name: 'Which compliance requirements are overdue?' })
      .click();

    await expect(page.getByText('Retrieval-based answer')).toBeVisible();
    await expect(page.getByText('Sources', { exact: true })).toBeVisible({ timeout: 15_000 });
    const sources = page.getByText('Open record');
    expect(await sources.count()).toBeGreaterThan(0);
    await expect(page.getByText('Limitation:', { exact: false })).toBeVisible();
    await expect(page.getByText('keyword retrieval', { exact: false }).first()).toBeVisible();
  });

  test('the assistant admits when it cannot ground an answer', async ({ page }) => {
    await signIn(page, IDENTITIES.complianceOfficer);
    await page.goto('/assistant');

    await page.getByLabel('Your question').fill('zzzzqqqxyw');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();

    await expect(page.getByText('No matching record was found', { exact: false })).toBeVisible();
    await expect(page.getByText('No stored record in your scope matches that question.', { exact: false })).toBeVisible();
  });

  test('the assistant refuses legal interpretation', async ({ page }) => {
    await signIn(page, IDENTITIES.complianceOfficer);
    await page.goto('/assistant');

    await page.getByLabel('Your question').fill('Am I legally liable under the applicable law?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();

    await expect(page.getByText('cannot interpret legislation', { exact: false })).toBeVisible();
    await expect(page.getByText('This is not legal advice.', { exact: false })).toBeVisible();
  });

  test('validates an empty assistant question', async ({ page }) => {
    await signIn(page, IDENTITIES.complianceOfficer);
    await page.goto('/assistant');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByText('Question is required.').first()).toBeVisible();
  });
});
