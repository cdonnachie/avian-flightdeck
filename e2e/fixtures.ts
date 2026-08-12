import { Page, expect, test as base } from '@playwright/test';

import { secureEncrypt } from '../src/services/wallet/WalletService';

/**
 * Shared setup for the end-to-end specs.
 *
 * Tests seed a wallet straight into IndexedDB rather than clicking through onboarding: creating a
 * wallet is a precondition here, not the thing under test, and driving the whole onboarding flow
 * before every spec would make these tests slow and brittle for no extra coverage.
 */

/**
 * Derived from the published BIP39 test mnemonic at m/44'/921'/0'/0/0. Publicly known by
 * definition — it must never hold funds. Matches the golden vectors in the Vitest suite.
 */
export const WALLET_ADDRESS = 'RMBnRfw6tV7dC7LS4Lr8JBWvocokzHQNeG';
const WALLET_WIF = 'KwgGM49xXFfGn1FK3JjbaKHzjNq2jydshvoYmwqjnGAsA4FeuqS4';

export const WALLET_PASSWORD = 'e2e-test-password';
export const WALLET_NAME = 'E2E Wallet';

const DB_NAME = 'AvianFlightDeck';

interface SeedRecord {
  name: string;
  address: string;
  privateKey: string;
  isEncrypted: boolean;
  isActive: boolean;
  createdAt: Date;
  lastAccessed: Date;
}

/** Accepts the terms so the app does not bounce us to /terms on first load. */
export async function acceptTerms(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('terms-accepted', 'true');
    localStorage.setItem('terms-accepted-date', new Date().toISOString());
  });
}

/**
 * Puts a wallet into the app's database. The app has to boot once first so that IndexedDB exists
 * with the current schema — creating it ourselves would risk drifting from StorageService.
 */
export async function seedWallet(page: Page) {
  const record: SeedRecord = {
    name: WALLET_NAME,
    address: WALLET_ADDRESS,
    privateKey: await secureEncrypt(WALLET_WIF, WALLET_PASSWORD),
    isEncrypted: true,
    isActive: true,
    createdAt: new Date(),
    lastAccessed: new Date(),
  };

  await page.goto('/');
  await page.waitForFunction(
    (name) =>
      indexedDB.databases
        ? indexedDB.databases().then((dbs) => dbs.some((db) => db.name === name))
        : true,
    DB_NAME,
    { timeout: 30_000 },
  );

  await page.evaluate(
    ({ dbName, wallet }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('wallets')) {
            db.close();
            reject(new Error('wallets store missing — did the app finish booting?'));
            return;
          }
          const transaction = db.transaction('wallets', 'readwrite');
          transaction.objectStore('wallets').put(wallet);
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    { dbName: DB_NAME, wallet: record },
  );

  // Reload so the wallet and security contexts pick the wallet up.
  await page.reload();
}

/**
 * Sets the opt-in screen-lock wall on or off. It updates the settings record the app already
 * created on boot (updating the existing record avoids the unique `key` index conflict a fresh
 * insert would hit) and reloads so it takes effect. Call after seedWallet.
 */
export async function setScreenLock(page: Page, enabled: boolean) {
  // Wait until the app has written its settings record.
  await page.waitForFunction(
    (dbName) =>
      new Promise<boolean>((resolve) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('preferences')) {
            db.close();
            resolve(false);
            return;
          }
          const g = db
            .transaction('preferences', 'readonly')
            .objectStore('preferences')
            .index('key')
            .get('settings');
          g.onsuccess = () => {
            db.close();
            resolve(!!g.result);
          };
          g.onerror = () => {
            db.close();
            resolve(false);
          };
        };
        req.onerror = () => resolve(false);
      }),
    DB_NAME,
    { timeout: 30_000 },
  );

  await page.evaluate(
    ({ dbName, enabled }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(req.error ?? new Error('open failed'));
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('preferences', 'readwrite');
          const store = tx.objectStore('preferences');
          const g = store.index('key').get('settings');
          g.onsuccess = () => {
            const rec = g.result;
            if (!rec) {
              reject(new Error('settings record missing'));
              return;
            }
            let parsed: Record<string, any> = {};
            try {
              parsed = typeof rec.value === 'string' ? JSON.parse(rec.value) : rec.value || {};
            } catch {
              parsed = {};
            }
            parsed.security_settings = parsed.security_settings || {};
            parsed.security_settings.autoLock = parsed.security_settings.autoLock || {};
            parsed.security_settings.autoLock.screenLockEnabled = enabled;
            rec.value = JSON.stringify(parsed);
            rec.updatedAt = new Date();
            store.put(rec);
          };
          g.onerror = () => reject(g.error ?? new Error('read failed'));
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error ?? new Error('write failed'));
        };
      }),
    { dbName: DB_NAME, enabled },
  );

  await page.reload();
}

/**
 * An encrypted wallet starts locked, so the app shows its lock screen until the password is
 * entered. Unlocking marks the session active, and that flag is inherited by popups opened from
 * this window, so it only has to be done once.
 */
async function unlockWallet(page: Page) {
  const unlockButton = page.getByRole('button', { name: 'Unlock Wallet' });
  await expect(unlockButton).toBeVisible({ timeout: 30_000 });

  // The lock screen's password field carries no id, unlike the one in AuthenticationDialog.
  await page.getByPlaceholder('Enter your wallet password').fill(WALLET_PASSWORD);
  await unlockButton.click();

  // Wait for the lock screen itself to go, not for the button: it only changes its label to
  // "Unlocking…" while scrypt runs, which would otherwise let a test navigate away mid-unlock.
  await expect(page.getByText('Wallet Locked')).toBeHidden({ timeout: 60_000 });
}

export const test = base.extend<{ walletPage: Page }>({
  /** A page with terms accepted and a single unlocked, encrypted wallet available. */
  walletPage: async ({ page }, use) => {
    // ElectrumX is unreachable from the test environment. Failing the socket immediately keeps
    // the app from sitting in connection retries while we drive the UI.
    await page.routeWebSocket(/.*/, (ws) => ws.close());

    await acceptTerms(page);
    await seedWallet(page);
    // These specs exercise the wallet behind the password wall, so opt into it explicitly (the
    // app default is now no wall). unlockWallet then drives the wall as before.
    await setScreenLock(page, true);
    await unlockWallet(page);
    await use(page);
  },
});

export { expect };

/** Opens the demo dApp and waits for it to be interactive. */
export async function openDemo(page: Page) {
  await page.goto('/connect/demo');
  // Card titles render as divs, so match on text rather than a heading role.
  await expect(page.getByText('Avian Connect demo dApp')).toBeVisible();
  // Clear anything a previous spec left in sessionStorage.
  await page.getByRole('button', { name: 'Clear demo session' }).click();
}

/** Enters the wallet password into the authentication dialog and submits it. */
export async function authenticate(target: Page) {
  const password = target.locator('#password');
  await expect(password).toBeVisible();
  await password.fill(WALLET_PASSWORD);
  await target.getByRole('button', { name: 'Unlock' }).click();
}
