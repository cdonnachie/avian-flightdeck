import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WalletService } from './WalletService';
import { StorageService } from '@/services/core/StorageService';
import { resetStorage } from '@/test/helpers';

/**
 * Choosing an ElectrumX server must (1) reconnect to the new server, (2) survive a reload, and
 * (3) tolerate a saved server that no longer exists. The ElectrumService always constructs with the
 * first server as its default, so these behaviours live in WalletService, which owns persistence.
 */

const SERVERS = [
  { host: 'electrum-us.avn.network', port: 50003, protocol: 'wss', region: 'US' },
  { host: 'electrum-eu.avn.network', port: 50003, protocol: 'wss', region: 'EU' },
];

/** A minimal stand-in for ElectrumService covering just the server-selection surface. */
function fakeElectrum() {
  let current = SERVERS[0];
  let connected = false;
  return {
    getAvailableServers: vi.fn(() => SERVERS),
    getCurrentServer: vi.fn(() => current),
    getServerUrl: vi.fn(() => `${current.protocol}://${current.host}:${current.port}`),
    isConnectedToServer: vi.fn(() => connected),
    connect: vi.fn(async () => {
      connected = true;
    }),
    disconnect: vi.fn(async () => {
      connected = false;
    }),
    selectServer: vi.fn((index: number) => {
      current = SERVERS[index];
    }),
    selectServerByHost: vi.fn((host: string) => {
      const match = SERVERS.find((s) => s.host === host);
      if (!match) throw new Error(`Server not found: ${host}`);
      current = match;
    }),
  };
}

beforeEach(() => {
  resetStorage();
});

describe('selectElectrumServer', () => {
  it('persists the chosen server so it survives a reload', async () => {
    const electrum = fakeElectrum();
    await new WalletService(electrum as never).selectElectrumServer(1);

    expect(electrum.selectServer).toHaveBeenCalledWith(1);
    expect(await StorageService.getSelectedElectrumServer()).toBe('electrum-eu.avn.network');
  });

  it('reconnects to the new server when it was connected', async () => {
    const electrum = fakeElectrum();
    await electrum.connect(); // start connected
    electrum.connect.mockClear();

    await new WalletService(electrum as never).selectElectrumServer(1);

    expect(electrum.disconnect).toHaveBeenCalled();
    expect(electrum.connect).toHaveBeenCalledTimes(1); // reconnected to the new server
    expect(electrum.isConnectedToServer()).toBe(true);
  });

  it('does not connect when it was not connected to begin with', async () => {
    const electrum = fakeElectrum();

    await new WalletService(electrum as never).selectElectrumServer(1);

    expect(electrum.disconnect).not.toHaveBeenCalled();
    expect(electrum.connect).not.toHaveBeenCalled();
    // But the choice is still remembered for next time.
    expect(await StorageService.getSelectedElectrumServer()).toBe('electrum-eu.avn.network');
  });
});

describe('restoreSelectedServer', () => {
  it('re-applies the saved server before connecting', async () => {
    await StorageService.setSelectedElectrumServer('electrum-eu.avn.network');
    const electrum = fakeElectrum();

    await new WalletService(electrum as never).restoreSelectedServer();

    expect(electrum.selectServerByHost).toHaveBeenCalledWith('electrum-eu.avn.network');
    expect(electrum.getCurrentServer().host).toBe('electrum-eu.avn.network');
  });

  it('does nothing when no server has been saved', async () => {
    const electrum = fakeElectrum();

    await new WalletService(electrum as never).restoreSelectedServer();

    expect(electrum.selectServerByHost).not.toHaveBeenCalled();
    expect(electrum.getCurrentServer().host).toBe('electrum-us.avn.network');
  });

  it('falls back to the default when the saved server no longer exists', async () => {
    await StorageService.setSelectedElectrumServer('electrum-gone.avn.network');
    const electrum = fakeElectrum();

    await expect(
      new WalletService(electrum as never).restoreSelectedServer(),
    ).resolves.toBeUndefined();
    expect(electrum.getCurrentServer().host).toBe('electrum-us.avn.network');
  });
});
