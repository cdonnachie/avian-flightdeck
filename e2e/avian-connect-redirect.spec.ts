import { Page } from '@playwright/test';

import { WALLET_ADDRESS, authenticate, expect, openDemo, test } from './fixtures';

/**
 * The redirect transport, used where popups are unreliable. The wallet navigates away, the user
 * approves, and the answer comes back in the URL fragment — which then has to be scrubbed.
 */

const approvalDialog = (page: Page) => page.getByRole('dialog');
const demoAddress = (page: Page) => page.getByTestId('demo-address');
const demoLog = (page: Page) => page.getByTestId('demo-log');

/** base64url, matching what the demo and the wallet agree on. */
const encodeRequest = (request: unknown) =>
  Buffer.from(JSON.stringify(request), 'utf8').toString('base64url');

async function openRedirectTab(page: Page) {
  await openDemo(page);
  await page.getByRole('tab', { name: 'Redirect (mobile)' }).click();
}

test.describe('redirect transport', () => {
  test('connect() round-trips through a navigation and returns the address', async ({
    walletPage,
  }) => {
    await openRedirectTab(walletPage);
    const origin = new URL(walletPage.url()).origin;

    await walletPage.getByRole('button', { name: 'connect()', exact: true }).click();

    // We are now on the wallet's own page, not a popup.
    await expect(walletPage).toHaveURL(/\/connect\?req=/);
    const dialog = approvalDialog(walletPage);
    await expect(dialog).toContainText('Connection request');
    await expect(dialog).toContainText(origin);
    // Over this transport a one-shot approval cannot outlive the navigation, and the screen says so.
    await expect(dialog).toContainText('Needed for the site to make any further request');

    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();

    // Back on the dApp with the answer applied.
    await expect(walletPage).toHaveURL(/\/connect\/demo/);
    await expect(demoAddress(walletPage)).toHaveText(WALLET_ADDRESS);
  });

  test('the response is scrubbed from the address bar', async ({ walletPage }) => {
    await openRedirectTab(walletPage);

    await walletPage.getByRole('button', { name: 'connect()', exact: true }).click();
    await approvalDialog(walletPage).getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(demoAddress(walletPage)).toHaveText(WALLET_ADDRESS);

    // The fragment carried the response; it must not be left sitting in the URL.
    expect(walletPage.url()).not.toContain('avianconnect=');
    expect(walletPage.url()).not.toContain('#');
  });

  test('signMessage() round-trips and the signature verifies against the same challenge', async ({
    walletPage,
  }) => {
    await openRedirectTab(walletPage);

    await walletPage.getByRole('button', { name: 'connect()', exact: true }).click();
    await approvalDialog(walletPage).getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(demoAddress(walletPage)).toHaveText(WALLET_ADDRESS);

    const challenge = await walletPage.locator('#demo-message').inputValue();

    await walletPage.getByRole('tab', { name: 'Redirect (mobile)' }).click();
    await walletPage.getByRole('button', { name: 'signMessage()', exact: true }).click();

    const signDialog = approvalDialog(walletPage);
    await expect(signDialog).toContainText('Signature request');
    await signDialog.getByRole('button', { name: 'Sign', exact: true }).click();
    await authenticate(walletPage);

    await expect(walletPage).toHaveURL(/\/connect\/demo/);
    // The challenge survived the navigation, so the signature is checked against what was signed.
    await expect(walletPage.locator('#demo-message')).toHaveValue(challenge);
    await expect(walletPage.getByTestId('demo-verification')).toHaveAttribute('data-valid', 'true');
  });

  test('a signature request from a site that never connected is refused', async ({
    walletPage,
  }) => {
    await openRedirectTab(walletPage);

    await walletPage.getByRole('button', { name: 'signMessage()', exact: true }).click();

    await expect(walletPage).toHaveURL(/\/connect\/demo/);
    await expect(demoLog(walletPage)).toContainText('ORIGIN_NOT_APPROVED');
  });
});

test.describe('redirect transport guards', () => {
  test('refuses to deliver a response to an origin the request did not claim', async ({
    walletPage,
  }) => {
    const origin = new URL(walletPage.url()).origin;
    // A site claiming to be somewhere else, but asking for the answer to be sent here.
    const request = {
      avianConnect: 1,
      id: 'evil-1',
      method: 'connect',
      origin: 'https://realm.example',
    };

    await walletPage.goto(
      `/connect?req=${encodeRequest(request)}&redirect_uri=${encodeURIComponent(origin + '/connect/demo')}`,
    );

    await expect(walletPage.getByText(/does not match the request origin/)).toBeVisible();
    // Crucially, it stays put rather than redirecting anywhere.
    await expect(walletPage).toHaveURL(/\/connect\?req=/);
    await expect(approvalDialog(walletPage)).toHaveCount(0);
  });

  test('refuses a request that is not valid base64url', async ({ walletPage }) => {
    const origin = new URL(walletPage.url()).origin;

    await walletPage.goto(
      `/connect?req=%%%not-base64%%%&redirect_uri=${encodeURIComponent(origin + '/connect/demo')}`,
    );

    await expect(walletPage.getByText(/not valid base64url|could not complete/i)).toBeVisible();
  });

  test('refuses a request with no redirect_uri at all', async ({ walletPage }) => {
    const request = { avianConnect: 1, id: 'x', method: 'connect', origin: 'https://realm.example' };

    await walletPage.goto(`/connect?req=${encodeRequest(request)}`);

    await expect(walletPage.getByText(/missing a redirect_uri/)).toBeVisible();
  });

  test('ignores a protocol version it does not speak', async ({ walletPage }) => {
    const origin = new URL(walletPage.url()).origin;
    const request = { avianConnect: 99, id: 'x', method: 'connect', origin };

    await walletPage.goto(
      `/connect?req=${encodeRequest(request)}&redirect_uri=${encodeURIComponent(origin + '/connect/demo')}`,
    );

    await expect(walletPage.getByText(/Unsupported protocol version/)).toBeVisible();
  });
});
