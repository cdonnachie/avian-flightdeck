import { test, expect } from './fixtures';

/**
 * The new-visitor landing page: shown at `/` only when there is no wallet on the device. A visitor
 * with a wallet goes straight to the dashboard instead (covered by the other specs, which seed a
 * wallet). This spec seeds nothing, so it exercises the landing path.
 */
test('a visitor with no wallet sees the landing page and can start onboarding', async ({ page }) => {
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.addInitScript(() => {
    localStorage.setItem('terms-accepted', 'true');
    localStorage.setItem('terms-accepted-date', new Date().toISOString());
  });

  await page.goto('/');

  // The landing hero is shown.
  await expect(page.getByRole('heading', { name: /Your funds/i })).toBeVisible({ timeout: 30_000 });

  // The primary CTA starts onboarding.
  const create = page.getByRole('button', { name: /Create a wallet/i });
  await expect(create).toBeVisible();
  await create.click();
  await expect(page).toHaveURL(/\/onboarding/);
});

/**
 * The landing page is the public entry point: a brand-new visitor who has not accepted the license
 * still lands here, not on the terms wall. The license is instead accepted when they choose to
 * create a wallet — onboarding routes them through /terms and back.
 */
test('a visitor who has not accepted terms still sees the landing, and Create routes via /terms', async ({
  page,
}) => {
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  // Deliberately seed no terms-accepted flag.

  await page.goto('/');

  // The landing hero shows without a license wall in front of it.
  await expect(page.getByRole('heading', { name: /Your funds/i })).toBeVisible({ timeout: 30_000 });

  // Starting onboarding now passes through the license gate first.
  await page.getByRole('button', { name: /Create a wallet/i }).click();
  await expect(page).toHaveURL(/\/terms/);
  await expect(page.getByText('License Agreement').first()).toBeVisible();
});
