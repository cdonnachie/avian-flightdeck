import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataWipeService } from './DataWipeService';
import { StorageService } from '@/services/core/StorageService';
import { resetStorage } from '@/test/helpers';

/**
 * The wipe path backs a privacy promise: after it runs, nothing the user had should still be on
 * the device. These tests check that each store is actually cleared, and that a failure in one
 * step is reported rather than swallowed.
 */

const seed = async () => {
  await StorageService.createWallet({
    name: 'Main',
    address: 'RMBnRfw6tV7dC7LS4Lr8JBWvocokzHQNeG',
    privateKey: 'encrypted-key',
    isEncrypted: true,
  });
  localStorage.setItem('lastKnownBalances', '{"R…":{"balance":100}}');
  localStorage.setItem('terms-accepted', 'true');
  sessionStorage.setItem('security_session_active', 'true');
};

beforeEach(() => {
  resetStorage();
  // The service logs progress with console.* directly; keep the test output readable.
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('wipeAllData', () => {
  it('clears localStorage and sessionStorage', async () => {
    await seed();

    const result = await DataWipeService.wipeAllData();

    expect(result.success).toBe(true);
    expect(localStorage.getItem('terms-accepted')).toBeNull();
    expect(localStorage.getItem('lastKnownBalances')).toBeNull();
    expect(sessionStorage.getItem('security_session_active')).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('deletes the wallet database, leaving no wallets behind', async () => {
    await seed();
    expect(await StorageService.getWalletCount()).toBe(1);

    // Drop the memoised handle first: an open connection blocks deletion, which is why the app
    // reloads immediately after wiping.
    resetStorage();

    const result = await DataWipeService.wipeAllData();

    expect(result.success).toBe(true);
    resetStorage();
    expect(await StorageService.getAllWallets()).toEqual([]);
  });

  it('succeeds on an already-empty device', async () => {
    const result = await DataWipeService.wipeAllData();

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports a storage failure instead of hiding it', async () => {
    await seed();
    vi.spyOn(localStorage, 'clear').mockImplementation(() => {
      throw new Error('storage is full');
    });

    const result = await DataWipeService.wipeAllData();

    expect(result.errors.join(' ')).toMatch(/storage is full/);
  });

  it('still clears the other stores when one of them fails', async () => {
    await seed();
    vi.spyOn(localStorage, 'clear').mockImplementation(() => {
      throw new Error('localStorage blocked');
    });

    const result = await DataWipeService.wipeAllData();

    expect(result.errors.some((error) => error.includes('localStorage'))).toBe(true);
    // sessionStorage was cleared even though localStorage refused.
    expect(sessionStorage.getItem('security_session_active')).toBeNull();
  });

  it('does not fall over when the Cache and Service Worker APIs are absent', async () => {
    // Neither exists under the test shims, which stands in for a browser without them.
    expect('caches' in window).toBe(false);
    expect('serviceWorker' in navigator).toBe(false);

    await expect(DataWipeService.wipeAllData()).resolves.toMatchObject({ success: true });
  });

  it('clears the caches it finds when the Cache API is available', async () => {
    const deleteCache = vi.fn(async () => true);
    vi.stubGlobal('caches', {
      keys: vi.fn(async () => ['workbox-precache', 'wasm-cache']),
      delete: deleteCache,
    });
    // The service checks `'caches' in window`, so the shimmed window needs it too.
    (window as unknown as Record<string, unknown>).caches = globalThis.caches;

    await DataWipeService.wipeAllData();

    expect(deleteCache).toHaveBeenCalledWith('workbox-precache');
    expect(deleteCache).toHaveBeenCalledWith('wasm-cache');

    delete (window as unknown as Record<string, unknown>).caches;
    vi.unstubAllGlobals();
  });

  it('unregisters service workers when the API is available', async () => {
    const unregister = vi.fn(async () => true);
    (navigator as unknown as Record<string, unknown>).serviceWorker = {
      getRegistrations: vi.fn(async () => [{ unregister }]),
    };

    await DataWipeService.wipeAllData();

    expect(unregister).toHaveBeenCalled();

    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  });

  it('records an error when service worker cleanup fails', async () => {
    (navigator as unknown as Record<string, unknown>).serviceWorker = {
      getRegistrations: vi.fn(async () => {
        throw new Error('worker registry unavailable');
      }),
    };

    const result = await DataWipeService.wipeAllData();

    expect(result.errors.join(' ')).toMatch(/Service worker cleanup failed/);

    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  });

  it('leaves nothing recoverable from local storage after a wipe', async () => {
    await seed();
    localStorage.setItem('avian_wallet_logs', 'sensitive log lines');

    await DataWipeService.wipeAllData();

    const remaining = Object.keys(localStorage);
    expect(remaining).toEqual([]);
  });
});
