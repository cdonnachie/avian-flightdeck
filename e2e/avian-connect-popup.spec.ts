import { Page } from '@playwright/test';

import { WALLET_ADDRESS, authenticate, expect, openDemo, test } from './fixtures';

/**
 * The popup transport, end to end: the demo dApp opens the wallet in a popup, the two talk over
 * postMessage, and the user approves in real dialogs. This is the part the Vitest suite cannot
 * reach, because it depends on two real windows and a real message channel.
 */

/** Clicks a demo button and returns the wallet popup it opens. */
async function callWithNewPopup(page: Page, method: string) {
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: method, exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  return popup;
}

const approvalDialog = (popup: Page) => popup.getByRole('dialog');
const demoAddress = (page: Page) => page.getByTestId('demo-address');
const demoLog = (page: Page) => page.getByTestId('demo-log');
const verification = (page: Page) => page.getByTestId('demo-verification');

test.describe('popup transport', () => {
  test('connect() returns the address after the user approves', async ({ walletPage }) => {
    await openDemo(walletPage);
    const origin = new URL(walletPage.url()).origin;

    const popup = await callWithNewPopup(walletPage, 'connect()');
    const dialog = approvalDialog(popup);

    // The approval screen names the requesting origin and the account being shared.
    await expect(dialog).toContainText('Connection request');
    await expect(dialog).toContainText(origin);
    await expect(dialog).toContainText('E2E Wallet');

    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();

    await expect(demoAddress(walletPage)).toHaveText(WALLET_ADDRESS);
  });

  test('the wallet hands back an address and nothing else', async ({ walletPage }) => {
    await openDemo(walletPage);

    const popup = await callWithNewPopup(walletPage, 'connect()');
    await approvalDialog(popup).getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(demoAddress(walletPage)).toHaveText(WALLET_ADDRESS);

    // Whatever crossed the channel is in the log verbatim; it must carry no key material.
    const log = await demoLog(walletPage).innerText();
    expect(log).toContain(`"address":"${WALLET_ADDRESS}"`);
    expect(log).not.toMatch(/privateKey|mnemonic|xprv|abandon/i);
  });

  test('a rejected connect() gives the dApp USER_REJECTED and no address', async ({
    walletPage,
  }) => {
    await openDemo(walletPage);

    const popup = await callWithNewPopup(walletPage, 'connect()');
    await approvalDialog(popup).getByRole('button', { name: 'Reject' }).click();

    await expect(demoLog(walletPage)).toContainText('USER_REJECTED');
    await expect(demoAddress(walletPage)).toHaveText('—');
  });

  test('signMessage() produces a signature that verifies for the connected address', async ({
    walletPage,
  }) => {
    await openDemo(walletPage);
    const origin = new URL(walletPage.url()).origin;

    const popup = await callWithNewPopup(walletPage, 'connect()');
    await approvalDialog(popup).getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(demoAddress(walletPage)).toHaveText(WALLET_ADDRESS);

    const challenge = await walletPage.locator('#demo-message').inputValue();
    await walletPage.getByRole('button', { name: 'signMessage()', exact: true }).click();

    // Remembering the site skipped the connect screen; it must not skip this one.
    const signDialog = approvalDialog(popup);
    await expect(signDialog).toContainText('Signature request');
    await expect(signDialog).toContainText(origin);
    // The message is shown in full, not truncated.
    await expect(signDialog).toContainText(challenge.split('\n')[0]);
    await expect(signDialog).toContainText(/Nonce: [0-9a-f]{16}/);

    await signDialog.getByRole('button', { name: 'Sign', exact: true }).click();

    // A signature always needs authentication, even for a remembered site.
    await authenticate(popup);

    await expect(verification(walletPage)).toHaveAttribute('data-valid', 'true');
    await expect(verification(walletPage)).toContainText(
      'Signature verified — the signer controls this address.',
    );
    await expect(verification(walletPage)).toContainText(WALLET_ADDRESS);
  });

  test('rejecting the signing screen signs nothing and never asks for the password', async ({
    walletPage,
  }) => {
    await openDemo(walletPage);

    const popup = await callWithNewPopup(walletPage, 'connect()');
    await approvalDialog(popup).getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(demoAddress(walletPage)).toHaveText(WALLET_ADDRESS);

    await walletPage.getByRole('button', { name: 'signMessage()', exact: true }).click();
    const signDialog = approvalDialog(popup);
    await expect(signDialog).toContainText('Signature request');
    await signDialog.getByRole('button', { name: 'Reject' }).click();

    await expect(demoLog(walletPage)).toContainText('USER_REJECTED');
    await expect(popup.locator('#password')).toHaveCount(0);
    await expect(walletPage.getByTestId('demo-signature')).toHaveText('—');
  });

  test('getAccounts() returns only the account that was shared', async ({ walletPage }) => {
    await openDemo(walletPage);

    const popup = await callWithNewPopup(walletPage, 'connect()');
    await approvalDialog(popup).getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(demoAddress(walletPage)).toHaveText(WALLET_ADDRESS);

    await walletPage.getByRole('button', { name: 'getAccounts()', exact: true }).click();

    await expect(demoLog(walletPage)).toContainText(`"result":["${WALLET_ADDRESS}"]`);
  });

  test('getNetwork() identifies mainnet without needing a permission', async ({ walletPage }) => {
    await openDemo(walletPage);

    await callWithNewPopup(walletPage, 'getNetwork()');

    await expect(demoLog(walletPage)).toContainText('"network":"mainnet"');
  });

  test('signPsbt() is refused as unsupported in this phase', async ({ walletPage }) => {
    await openDemo(walletPage);

    await callWithNewPopup(walletPage, 'signPsbt() → unsupported');

    await expect(demoLog(walletPage)).toContainText('UNSUPPORTED_METHOD');
  });

  test('a site that has not connected cannot ask for a signature', async ({ walletPage }) => {
    await openDemo(walletPage);

    const popup = await callWithNewPopup(walletPage, 'signMessage()');

    await expect(demoLog(walletPage)).toContainText('ORIGIN_NOT_APPROVED');
    await expect(approvalDialog(popup)).toHaveCount(0);
  });
});
