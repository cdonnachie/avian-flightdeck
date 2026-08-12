import { test, expect } from './fixtures';

/**
 * The seeded wallet has no transaction history and the fixture blocks the socket, so the history
 * panel has nothing to show — exactly the empty-state case. This guards that it renders the
 * friendly "No transactions yet" state rather than a blank panel or a stuck spinner.
 */
test('transaction history shows a friendly empty state with no transactions', async ({
  walletPage,
}) => {
  await walletPage.goto('/');

  // Desktop layout renders the history panel directly; the empty state settles after loading.
  await expect(walletPage.getByText('No transactions yet').first()).toBeVisible({
    timeout: 30_000,
  });
});
