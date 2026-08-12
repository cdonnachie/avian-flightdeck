import { Page } from '@playwright/test';

import { WALLET_ADDRESS, authenticate, expect, openDemo, test } from './fixtures';

/**
 * Permissions as the user experiences them: remembering a site, seeing it in Settings, revoking
 * it, and the wallet asking again afterwards. Plus the acceptance check from the original brief —
 * a signature obtained over Avian Connect verifies in Message Utilities → Verify.
 */

const approvalDialog = (page: Page) => page.getByRole('dialog');
const demoAddress = (page: Page) => page.getByTestId('demo-address');

async function connectViaPopup(page: Page) {
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'connect()', exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await approvalDialog(popup).getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(demoAddress(page)).toHaveText(WALLET_ADDRESS);
  return popup;
}

test.describe('remembering and revoking a site', () => {
  test('a remembered site reconnects without asking again', async ({ walletPage }) => {
    await openDemo(walletPage);
    const popup = await connectViaPopup(walletPage);
    await popup.close();

    // A second visit: the site asks again, and the wallet answers straight away.
    await openDemo(walletPage);
    const secondPopupPromise = walletPage.waitForEvent('popup');
    await walletPage.getByRole('button', { name: 'connect()', exact: true }).click();
    const secondPopup = await secondPopupPromise;

    await expect(demoAddress(walletPage)).toHaveText(WALLET_ADDRESS);
    await expect(approvalDialog(secondPopup)).toHaveCount(0);
  });

  test('the site appears in Settings → Connected Sites', async ({ walletPage }) => {
    await openDemo(walletPage);
    const origin = new URL(walletPage.url()).origin;
    const popup = await connectViaPopup(walletPage);
    await popup.close();

    await walletPage.goto('/settings/connected-sites');

    await expect(walletPage.getByRole('heading', { name: 'Connected Sites' })).toBeVisible();
    await expect(walletPage.getByText(origin, { exact: true })).toBeVisible();
    // The account it can see is shown, shortened.
    await expect(walletPage.getByText(WALLET_ADDRESS.slice(0, 12))).toBeVisible();
  });

  test('revoking makes the next connect() prompt again', async ({ walletPage }) => {
    await openDemo(walletPage);
    const firstPopup = await connectViaPopup(walletPage);
    // The wallet window is named, so window.open would reuse it rather than opening a new one.
    await firstPopup.close();

    await walletPage.goto('/settings/connected-sites');
    await walletPage.getByRole('button', { name: 'Revoke' }).click();
    // Confirm in the modal.
    await walletPage.getByRole('button', { name: 'Revoke', exact: true }).last().click();

    await expect(walletPage.getByText('No connected sites')).toBeVisible();

    // Back at the dApp, the wallet no longer recognises it.
    await openDemo(walletPage);
    const popupPromise = walletPage.waitForEvent('popup');
    await walletPage.getByRole('button', { name: 'connect()', exact: true }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');

    await expect(approvalDialog(popup)).toContainText('Connection request');
  });

  test('disconnect() from the dApp side clears the permission too', async ({ walletPage }) => {
    await openDemo(walletPage);
    const popup = await connectViaPopup(walletPage);

    await walletPage.getByRole('button', { name: 'disconnect()', exact: true }).click();
    await expect(walletPage.getByTestId('demo-log')).toContainText('"disconnected":true');
    await popup.close();

    await walletPage.goto('/settings/connected-sites');
    await expect(walletPage.getByText('No connected sites')).toBeVisible();
  });
});

test.describe('acceptance: the signature verifies in Message Utilities', () => {
  test('a signature from Avian Connect verifies in the wallet’s own verify tab', async ({
    walletPage,
  }) => {
    await openDemo(walletPage);
    const popup = await connectViaPopup(walletPage);

    const challenge = await walletPage.locator('#demo-message').inputValue();
    await walletPage.getByRole('button', { name: 'signMessage()', exact: true }).click();
    await approvalDialog(popup).getByRole('button', { name: 'Sign', exact: true }).click();
    await authenticate(popup);
    // Signing decrypts the key with scrypt (hardened to ~64 MB), which is deliberately slow and
    // slower still under parallel e2e workers — give it headroom beyond the default expect timeout.
    await expect(walletPage.getByTestId('demo-verification')).toHaveAttribute('data-valid', 'true', {
      timeout: 30_000,
    });

    // Take the full signature from the demo's own session, the way a user would copy it.
    const signature = await walletPage.evaluate(
      () => JSON.parse(sessionStorage.getItem('avian-connect-demo') || '{}').signature as string,
    );
    expect(signature).toBeTruthy();
    await popup.close();

    // Now verify it through the wallet UI, independently of the dApp.
    await walletPage.goto('/settings/advanced');
    await walletPage.getByText('Message Utilities').click();
    await walletPage.getByRole('tab', { name: 'Verify' }).click();

    await walletPage.locator('#verify-address').fill(WALLET_ADDRESS);
    await walletPage.locator('#verify-message').fill(challenge);
    await walletPage.locator('#verify-signature').fill(signature);
    await walletPage.getByRole('button', { name: 'Verify Signature' }).click();

    await expect(walletPage.getByText('Verification successful!')).toBeVisible();
  });

  test('a tampered message does not verify', async ({ walletPage }) => {
    await openDemo(walletPage);
    const popup = await connectViaPopup(walletPage);

    const challenge = await walletPage.locator('#demo-message').inputValue();
    await walletPage.getByRole('button', { name: 'signMessage()', exact: true }).click();
    await approvalDialog(popup).getByRole('button', { name: 'Sign', exact: true }).click();
    await authenticate(popup);
    // Signing decrypts the key with scrypt (hardened to ~64 MB), which is deliberately slow and
    // slower still under parallel e2e workers — give it headroom beyond the default expect timeout.
    await expect(walletPage.getByTestId('demo-verification')).toHaveAttribute('data-valid', 'true', {
      timeout: 30_000,
    });

    const signature = await walletPage.evaluate(
      () => JSON.parse(sessionStorage.getItem('avian-connect-demo') || '{}').signature as string,
    );
    await popup.close();

    await walletPage.goto('/settings/advanced');
    await walletPage.getByText('Message Utilities').click();
    await walletPage.getByRole('tab', { name: 'Verify' }).click();

    await walletPage.locator('#verify-address').fill(WALLET_ADDRESS);
    await walletPage.locator('#verify-message').fill(`${challenge} tampered`);
    await walletPage.locator('#verify-signature').fill(signature);
    await walletPage.getByRole('button', { name: 'Verify Signature' }).click();

    await expect(walletPage.getByText('Verification failed')).toBeVisible();
  });
});
