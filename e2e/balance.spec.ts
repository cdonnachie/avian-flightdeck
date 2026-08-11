import { WALLET_ADDRESS, expect, test } from './fixtures';

/**
 * What the balance display claims when the server cannot be reached. The fixture blocks all
 * WebSocket traffic, so these tests run in exactly the situation the fix is about: a wallet
 * that cannot confirm anything must say so, not present a confident zero.
 */

test.describe('balance display while the server is unreachable', () => {
  test('shows unavailable rather than a zero balance', async ({ walletPage }) => {
    await walletPage.goto('/');

    // The responsive layout renders a mobile and a desktop copy; exactly one is visible.
    const unavailable = walletPage.getByTestId('balance-unavailable').filter({ visible: true });
    await expect(unavailable).toBeVisible();
    await expect(unavailable).toContainText('balance unavailable');

    // The unavailable marker replaces the figure, rather than sitting next to a "last known"
    // caveat — this is genuinely no-data, not a remembered value.
    await expect(walletPage.getByTestId('balance-stale')).toHaveCount(0);
  });

  test('shows a previously seen balance as last known, not as current', async ({ walletPage }) => {
    // A previous session saw a real balance; the app persists it per wallet in localStorage.
    await walletPage.evaluate((address) => {
      localStorage.setItem(
        'lastKnownBalances',
        JSON.stringify({ [address]: { balance: 12_345_678, timestamp: Date.now() } }),
      );
    }, WALLET_ADDRESS);

    await walletPage.goto('/');

    const stale = walletPage.getByTestId('balance-stale').filter({ visible: true });
    await expect(stale).toBeVisible();
    await expect(stale).toContainText('last known');

    // The remembered figure is shown (it appears in more than one place; any visible one proves
    // the point), and it is not dressed up as unavailable.
    await expect(walletPage.getByText('0.12345678 AVN').first()).toBeVisible();
    await expect(walletPage.getByTestId('balance-unavailable')).toHaveCount(0);
  });
});
