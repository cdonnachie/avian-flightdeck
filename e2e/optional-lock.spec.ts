import {
  test,
  expect,
  acceptTerms,
  seedWallet,
  setScreenLock,
  WALLET_ADDRESS,
  WALLET_PASSWORD,
} from './fixtures';

/**
 * The optional lock screen (docs/proposals/optional-lock-screen.md). Two modes:
 *  - default (screen lock off): the wallet loads read-only with no password wall;
 *  - screen lock on: the full password wall shows on start and unlock reveals the wallet.
 * Both seed a wallet directly; the difference is the `screenLockEnabled` setting.
 */

test.describe('optional lock screen', () => {
  test('screen lock OFF: wallet loads read-only without a password', async ({ page }) => {
    await page.routeWebSocket(/.*/, (ws) => ws.close());
    await acceptTerms(page);
    await seedWallet(page);
    await setScreenLock(page, false); // no wall

    // No password wall.
    await expect(page.getByRole('button', { name: 'Unlock', exact: true })).toHaveCount(0);
    await expect(page.getByText('Wallet locked')).toHaveCount(0);

    // Read-only content is visible without authenticating: the address is shown, and the balance
    // reads "unavailable" (the socket is blocked) rather than a misleading zero. The responsive
    // layout renders a mobile and a desktop copy; assert on the visible one.
    await expect(
      page.getByText(WALLET_ADDRESS).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('balance-unavailable').filter({ visible: true })).toBeVisible();
  });

  test('screen lock ON: the wall shows on start and unlock reveals the wallet', async ({ page }) => {
    await page.routeWebSocket(/.*/, (ws) => ws.close());
    await acceptTerms(page);
    await seedWallet(page);
    await setScreenLock(page, true); // wall on

    const unlockButton = page.getByRole('button', { name: 'Unlock', exact: true });
    await expect(unlockButton).toBeVisible({ timeout: 30_000 });

    await page.getByPlaceholder('Password').fill(WALLET_PASSWORD);
    await unlockButton.click();

    // The wall goes away and the wallet is revealed.
    await expect(page.getByText('Wallet locked')).toBeHidden({ timeout: 60_000 });
    await expect(
      page.getByText(WALLET_ADDRESS).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});
