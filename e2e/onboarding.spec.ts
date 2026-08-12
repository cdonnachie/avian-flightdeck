import { test, expect } from './fixtures';

/**
 * The guided create flow: generate → back up → confirm → set password → wallet created.
 * Unlike the other specs (which seed a wallet straight into IndexedDB), this one is precisely
 * about driving onboarding, so it starts from a fresh, wallet-less page. The confirm step is
 * exercised for real: we read the freshly generated phrase from the reveal grid and tap the
 * correct words back in, proving the check actually validates the backup.
 */

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('onboarding — guided create wallet', () => {
  test('generate → reveal → confirm → password creates a wallet', async ({ page }) => {
    // No ElectrumX in the test environment; fail the socket fast so nothing hangs on retries.
    await page.routeWebSocket(/.*/, (ws) => ws.close());
    await page.addInitScript(() => {
      localStorage.setItem('terms-accepted', 'true');
      localStorage.setItem('terms-accepted-date', new Date().toISOString());
    });

    await page.goto('/onboarding');

    // Welcome → method selection → Create.
    await page.getByRole('button', { name: 'Get Started' }).click();
    await page.getByText('Create New Wallet').click();

    // Step 1 — details.
    await page.getByLabel('Wallet name').fill('My First Wallet');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2 — reveal and read the generated phrase, in order.
    await page.getByRole('button', { name: 'Tap to reveal' }).click();
    const words = await page.getByTestId('seed-word').allTextContents();
    expect(words).toHaveLength(12);

    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3 — confirm: read which positions are asked for, tap those exact words back.
    const slotLabels = await page.getByTestId('confirm-slot-pos').allTextContents();
    for (const label of slotLabels) {
      const position = Number(label.replace('#', '')); // 1-based
      const word = words[position - 1];
      await page
        .locator('button[data-testid="bank-word"]:not([disabled])')
        .filter({ hasText: new RegExp(`^${escapeRegex(word)}$`) })
        .first()
        .click();
    }
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 4 — set a password and create.
    await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery');
    await page.getByLabel('Confirm password').fill('correct-horse-battery');
    await page.getByRole('button', { name: /Create wallet/ }).click();

    // Creation runs scrypt, so allow time; success proves the wallet was written.
    await expect(page.getByText('Setup Complete!')).toBeVisible({ timeout: 60_000 });
  });

  test('a wrong confirmation is rejected and cannot proceed', async ({ page }) => {
    await page.routeWebSocket(/.*/, (ws) => ws.close());
    await page.addInitScript(() => {
      localStorage.setItem('terms-accepted', 'true');
      localStorage.setItem('terms-accepted-date', new Date().toISOString());
    });

    await page.goto('/onboarding');
    await page.getByRole('button', { name: 'Get Started' }).click();
    await page.getByText('Create New Wallet').click();
    await page.getByLabel('Wallet name').fill('Careless Wallet');
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('button', { name: 'Tap to reveal' }).click();
    const words = await page.getByTestId('seed-word').allTextContents();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Fill every slot with an enabled word that is NOT that slot's correct answer.
    const slotLabels = await page.getByTestId('confirm-slot-pos').allTextContents();
    for (const label of slotLabels) {
      const position = Number(label.replace('#', ''));
      const correct = words[position - 1];
      const enabled = page.locator('button[data-testid="bank-word"]:not([disabled])');
      const count = await enabled.count();
      let clicked = false;
      for (let i = 0; i < count; i++) {
        const btn = enabled.nth(i);
        const txt = (await btn.textContent())?.trim();
        if (txt && txt !== correct) {
          await btn.click();
          clicked = true;
          break;
        }
      }
      expect(clicked).toBeTruthy();
    }

    // The mismatch is reported and Continue stays disabled.
    await expect(page.getByText("That order doesn't match", { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});
