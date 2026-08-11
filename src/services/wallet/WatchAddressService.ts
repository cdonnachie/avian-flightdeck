import { isBrowser } from '@/lib/utils';
import ElectrumBridge from '@/lib/electrum-bridge';
import { StorageService } from '@/services/core/StorageService';
import { watchAddressLogger } from '@/lib/Logger';
/**
 * Interfaces for watch addresses
 */
export interface WatchAddress {
  id?: number;
  user_wallet_address: string;
  watch_address: string;
  label: string;
  notification_types?: string[]; // e.g., ["balance", "transactions"]
  created_at?: string;
  balance?: number; // Added balance field to store current balance
  script_hash?: string; // Added script hash for ElectrumX subscription
}

/**
 * Watch Address Service
 * Manages watch addresses for users using IndexedDB
 */
export class WatchAddressService {
  private static STORE_KEY = 'watched_addresses';

  // Map to store the last known status for each address
  private static addressStatusMap: Record<string, string> = {};

  /**
   * Gets the watched addresses storage key for a specific wallet
   */
  private static getStorageKey(userWalletAddress: string): string {
    return `${this.STORE_KEY}_${userWalletAddress}`;
  }

  /**
   * Initialize or get the watched addresses for a wallet
   */
  private static async getWatchedAddressesStore(
    userWalletAddress: string,
  ): Promise<WatchAddress[]> {
    const maxRetries = 5;
    let retries = 0;
    let lastError = null;

    while (retries < maxRetries) {
      try {
        // Wait a bit to ensure any ongoing DB operations are complete
        // Increase wait time with each retry
        await new Promise((resolve) => setTimeout(resolve, 50 * (retries + 1)));

        const settings = await StorageService.getSettings();
        const storageKey = this.getStorageKey(userWalletAddress);

        return settings[storageKey] ? JSON.parse(settings[storageKey]) : [];
      } catch (error) {
        lastError = error;
        retries++;

        // Special handling for version change transaction errors
        const isVersionChangeError =
          error instanceof Error &&
          (error.name === 'AbortError' || error.message.includes('Version change'));

        if (isVersionChangeError) {
          watchAddressLogger.warn(
            `IndexedDB version change detected, retry ${retries}/${maxRetries}`,
          );
          // Wait a bit longer for version changes
          await new Promise((resolve) => setTimeout(resolve, 300 * retries));
        } else {
          watchAddressLogger.warn(
            `Error getting watched addresses, retry ${retries}/${maxRetries}:`,
            error,
          );
          // Standard backoff for other errors
          await new Promise((resolve) => setTimeout(resolve, 100 * retries));
        }

        if (retries >= maxRetries) {
          watchAddressLogger.error(
            'Max retries reached when getting watched addresses from storage:',
            lastError,
          );
          return [];
        }
      }
    }

    return []; // Should never reach here due to the return in the error handling
  }

  /**
   * Saves the watched addresses for a wallet
   */
  private static async saveWatchedAddressesStore(
    userWalletAddress: string,
    watches: WatchAddress[],
  ): Promise<boolean> {
    try {
      const storageKey = this.getStorageKey(userWalletAddress);

      // Merge this wallet's watch list into the settings blob atomically. A concurrent write to
      // another key — the security settings, or another wallet's watch list — can no longer be
      // lost by racing this one. This replaces the previous read-modify-write with retries and
      // fixed sleeps, which was a timing band-aid for that very race.
      await StorageService.mutateSettings((settings) => ({
        ...settings,
        [storageKey]: JSON.stringify(watches),
      }));

      return true;
    } catch (error) {
      watchAddressLogger.error('Failed to save watched addresses to storage:', error);
      return false;
    }
  }

  /**
   * Adds a new address to watch
   */
  static async addWatchAddress(
    userWalletAddress: string,
    watchAddress: string,
    label: string,
  ): Promise<boolean> {
    try {
      // Skip operations if not in browser environment
      if (!isBrowser()) {
        return false;
      }

      // Validate addresses
      if (!userWalletAddress || !watchAddress) {
        watchAddressLogger.error('Invalid addresses provided');
        return false;
      }

      // Use a sanitized label or default if none provided
      const safeLabel = label?.trim() || `Watched ${watchAddress.substring(0, 6)}...`;

      // Get ElectrumBridge instance for both script hash generation and balance operations
      const electrumBridge = ElectrumBridge.getInstance();

      // Generate script hash for ElectrumX subscription
      const scriptHash = electrumBridge.addressToScriptHash(watchAddress);

      // Retry up to 3 times in case of IndexedDB transaction issues
      let retries = 0;
      const maxRetries = 3;
      let watches: WatchAddress[] = [];

      while (retries < maxRetries) {
        try {
          // Get current watched addresses
          watches = await this.getWatchedAddressesStore(userWalletAddress);
          break; // If successful, exit the retry loop
        } catch (err) {
          retries++;
          if (retries >= maxRetries) throw err;
          // Wait a bit longer on each retry
          await new Promise((resolve) => setTimeout(resolve, 100 * retries));
        }
      }

      // Check if already watching this address
      const existingIndex = watches.findIndex((w) => w.watch_address === watchAddress);

      if (existingIndex !== -1) {
        // Update label if it changed
        if (watches[existingIndex].label !== safeLabel) {
          watches[existingIndex].label = safeLabel;
          await this.saveWatchedAddressesStore(userWalletAddress, watches);
        }
        return true;
      }

      // Get initial balance from ElectrumX
      let balance = 0;
      try {
        balance = await electrumBridge.getAddressBalance(watchAddress);
      } catch (err) {
        watchAddressLogger.warn(`Could not get initial balance for ${watchAddress}:`, err);
        // Continue without balance - it will be updated later
      }

      try {
        // Subscribe to address changes
        await electrumBridge.subscribeToAddress(watchAddress, async (status: string) => {
          try {
            // Check if this is a new status
            const lastKnownStatus = this.addressStatusMap[watchAddress];

            // Log the status change for debugging
            watchAddressLogger.debug(
              `Address ${watchAddress} status changed: ${status} (previous: ${lastKnownStatus || 'none'})`,
            );

            // Skip processing if status hasn't changed
            if (status === lastKnownStatus) {
              watchAddressLogger.debug(
                `Address ${watchAddress}: Status unchanged, skipping balance update`,
              );
              return;
            }

            // Update our cached status
            this.addressStatusMap[watchAddress] = status;

            // When status changes, refresh the balance
            const newBalance = await electrumBridge.getAddressBalance(watchAddress);
            await this.updateWatchAddressBalance(userWalletAddress, watchAddress, newBalance);
          } catch (subscriptionError) {
            watchAddressLogger.error('Error in subscription callback:', subscriptionError);
          }
        });
      } catch (subscriptionError) {
        watchAddressLogger.warn(
          `Failed to subscribe to address ${watchAddress}:`,
          subscriptionError,
        );
        // Continue even if subscription fails - we'll still have the address saved
      }

      // Add new watched address
      watches.push({
        user_wallet_address: userWalletAddress,
        watch_address: watchAddress,
        label: safeLabel,
        notification_types: ['balance'],
        created_at: new Date().toISOString(),
        balance: balance,
        script_hash: scriptHash,
      });

      // Try to save with retries
      retries = 0;
      while (retries < maxRetries) {
        try {
          // Save updated list
          await this.saveWatchedAddressesStore(userWalletAddress, watches);
          break; // If successful, exit the retry loop
        } catch (err) {
          retries++;
          watchAddressLogger.warn(`Retry ${retries}/${maxRetries} saving watched addresses:`, err);
          if (retries >= maxRetries) throw err;
          // Wait a bit longer on each retry
          await new Promise((resolve) => setTimeout(resolve, 200 * retries));
        }
      }
      return true;
    } catch (error) {
      watchAddressLogger.error('Error in addWatchAddress:', error);
      return false;
    }
  }

  /**
   * Removes a watched address
   */
  static async removeWatchAddress(
    userWalletAddress: string,
    watchAddress: string,
  ): Promise<boolean> {
    try {
      // Skip operations if not in browser environment
      if (!isBrowser()) {
        return false;
      }

      // Unsubscribe from ElectrumX notifications
      const electrumBridge = ElectrumBridge.getInstance();
      electrumBridge.unsubscribeFromAddress(watchAddress);

      // Get current watched addresses
      const watches = await this.getWatchedAddressesStore(userWalletAddress);

      // Filter out the address to remove
      const filteredWatches = watches.filter((w) => w.watch_address !== watchAddress);

      // Only save if something was actually removed
      if (filteredWatches.length < watches.length) {
        await this.saveWatchedAddressesStore(userWalletAddress, filteredWatches);
      }

      // Clean up the status map
      if (this.addressStatusMap[watchAddress]) {
        delete this.addressStatusMap[watchAddress];
        watchAddressLogger.debug(`Removed status tracking for address: ${watchAddress}`);
      }

      return true;
    } catch (error) {
      watchAddressLogger.error('Error in removeWatchAddress:', error);
      return false;
    }
  }

  /**
   * Removes all watched addresses for a user wallet
   */
  static async removeAllWatchAddresses(userWalletAddress: string): Promise<boolean> {
    try {
      // Skip operations if not in browser environment
      if (!isBrowser()) {
        return false;
      }

      // Get current watched addresses to unsubscribe from each one
      const watches = await this.getWatchedAddressesStore(userWalletAddress);

      if (watches.length > 0) {
        const electrumBridge = ElectrumBridge.getInstance();

        // Unsubscribe from all addresses
        for (const watch of watches) {
          electrumBridge.unsubscribeFromAddress(watch.watch_address);

          // Clean up the status map for each address
          if (this.addressStatusMap[watch.watch_address]) {
            delete this.addressStatusMap[watch.watch_address];
          }
        }

        watchAddressLogger.debug(
          `Removed status tracking for ${watches.length} addresses from wallet ${userWalletAddress}`,
        );

        // Clear the storage
        await this.saveWatchedAddressesStore(userWalletAddress, []);
      }

      return true;
    } catch (error) {
      watchAddressLogger.error('Error in removeAllWatchAddresses:', error);
      return false;
    }
  }

  /**
   * Gets all addresses watched by a user
   */
  static async getWatchedAddresses(userWalletAddress: string): Promise<WatchAddress[]> {
    try {
      // Skip operations if not in browser environment
      if (!isBrowser()) {
        return [];
      }

      // Enhanced retry logic with better error handling
      const maxRetries = 5;
      let retries = 0;
      let addresses: WatchAddress[] = [];
      let lastError = null;

      // First phase: get watched addresses with retries
      while (retries < maxRetries) {
        try {
          // Get watched addresses from storage
          addresses = await this.getWatchedAddressesStore(userWalletAddress);
          break; // If successful, exit the retry loop
        } catch (err) {
          lastError = err;
          retries++;

          // Special handling for version change transaction errors
          const isVersionChangeError =
            err instanceof Error &&
            (err.name === 'AbortError' || (err.message && err.message.includes('Version change')));

          if (isVersionChangeError) {
            watchAddressLogger.warn(
              `IndexedDB version change detected in getWatchedAddresses, retry ${retries}/${maxRetries}`,
            );
            // Wait a bit longer for version changes
            await new Promise((resolve) => setTimeout(resolve, 350 * retries));
          } else {
            watchAddressLogger.warn(
              `Retry ${retries}/${maxRetries} getting watched addresses:`,
              err,
            );
            // Standard backoff for other errors
            await new Promise((resolve) => setTimeout(resolve, 200 * retries));
          }

          if (retries >= maxRetries) {
            watchAddressLogger.error(
              'Failed to get watched addresses after maximum retries:',
              lastError,
            );
            return []; // Return empty array after max retries
          }
        }
      }

      // Second phase: update balances if we have addresses
      if (addresses.length > 0) {
        try {
          let balancesUpdated = false;
          const electrumBridge = ElectrumBridge.getInstance();

          // Process addresses in batches to avoid too many concurrent operations
          const batchSize = 3;
          for (let i = 0; i < addresses.length; i += batchSize) {
            const batch = addresses.slice(i, i + batchSize);

            // Process each batch with promises
            await Promise.all(
              batch.map(async (address) => {
                try {
                  const newBalance = await electrumBridge.getAddressBalance(address.watch_address);
                  if (address.balance !== newBalance) {
                    address.balance = newBalance;
                    balancesUpdated = true;
                  }
                } catch (err) {
                  watchAddressLogger.error(
                    'Error fetching balance for address:',
                    address.watch_address,
                    err,
                  );
                }
              }),
            );
          }

          // Only save if balances have actually changed
          if (balancesUpdated) {
            // Try to save with retries
            retries = 0;
            while (retries < maxRetries) {
              try {
                await this.saveWatchedAddressesStore(userWalletAddress, addresses);
                break; // If successful, exit the retry loop
              } catch (err) {
                retries++;
                watchAddressLogger.warn(
                  `Retry ${retries}/${maxRetries} saving updated balances:`,
                  err,
                );
                if (retries >= maxRetries) {
                  watchAddressLogger.error(
                    'Failed to save updated balances after retries. Will return addresses without saving:',
                    err,
                  );
                  break; // Continue to return addresses even if saving fails
                }
                await new Promise((resolve) => setTimeout(resolve, 200 * retries));
              }
            }
          }
        } catch (balanceError) {
          // If balance updating fails, log and continue with the addresses we have
          watchAddressLogger.error('Error updating balances for watched addresses:', balanceError);
        }
      }

      return addresses;
    } catch (error) {
      watchAddressLogger.error('Error in getWatchedAddresses:', error);
      return [];
    }
  }

  /**
   * Updates notification preferences for a watched address
   */
  static async updateWatchAddressNotifications(
    userWalletAddress: string,
    watchAddress: string,
    notificationTypes: string[],
  ): Promise<boolean> {
    try {
      // Skip operations if not in browser environment
      if (!isBrowser()) {
        return false;
      }

      // Get current watched addresses
      const watches = await this.getWatchedAddressesStore(userWalletAddress);

      // Find the watch address to update
      const addressIndex = watches.findIndex((w) => w.watch_address === watchAddress);

      if (addressIndex === -1) {
        watchAddressLogger.error('Watch address not found');
        return false;
      }

      // Update notification types
      watches[addressIndex].notification_types = notificationTypes;

      // Save changes
      await this.saveWatchedAddressesStore(userWalletAddress, watches);

      return true;
    } catch (error) {
      watchAddressLogger.error('Error in updateWatchAddressNotifications:', error);
      return false;
    }
  }

  /**
   * Updates the balance for a watched address
   */
  static async updateWatchAddressBalance(
    userWalletAddress: string,
    watchAddress: string,
    balance: number,
  ): Promise<boolean> {
    try {
      if (!isBrowser()) {
        return false;
      }

      // Get current watched addresses
      const watches = await this.getWatchedAddressesStore(userWalletAddress);

      // Find the watch address to update
      const addressIndex = watches.findIndex((w) => w.watch_address === watchAddress);

      if (addressIndex === -1) {
        watchAddressLogger.error('Watch address not found');
        return false;
      }

      // Update balance
      watches[addressIndex].balance = balance;

      // Save changes
      await this.saveWatchedAddressesStore(userWalletAddress, watches);

      return true;
    } catch (error) {
      watchAddressLogger.error('Error in updateWatchAddressBalance:', error);
      return false;
    }
  }

  /**
   * Refreshes balances for all watched addresses
   */
  static async refreshWatchAddressBalances(userWalletAddress: string): Promise<boolean> {
    try {
      if (!isBrowser()) {
        return false;
      }

      // Enhanced retry logic with better error handling
      const maxRetries = 5;
      let retries = 0;
      let addresses: WatchAddress[] = [];
      let lastError = null;

      // First phase: get watched addresses with enhanced retries
      while (retries < maxRetries) {
        try {
          // Get all watched addresses
          addresses = await this.getWatchedAddressesStore(userWalletAddress);
          break; // If successful, exit the retry loop
        } catch (err) {
          lastError = err;
          retries++;

          // Special handling for version change transaction errors
          const isVersionChangeError =
            err instanceof Error &&
            (err.name === 'AbortError' || (err.message && err.message.includes('Version change')));

          if (isVersionChangeError) {
            watchAddressLogger.warn(
              `IndexedDB version change detected in refreshWatchAddressBalances, retry ${retries}/${maxRetries}`,
            );
            // Wait a bit longer for version changes
            await new Promise((resolve) => setTimeout(resolve, 350 * retries));
          } else {
            watchAddressLogger.warn(
              `Retry ${retries}/${maxRetries} getting watched addresses for refresh:`,
              err,
            );
            // Standard backoff for other errors
            await new Promise((resolve) => setTimeout(resolve, 200 * retries));
          }

          if (retries >= maxRetries) {
            watchAddressLogger.error(
              'Failed to get watched addresses for refresh after maximum retries:',
              lastError,
            );
            return false;
          }
        }
      }

      if (addresses.length === 0) {
        return true;
      }

      const electrumBridge = ElectrumBridge.getInstance();
      let updated = false;

      // Process addresses in batches to avoid too many concurrent operations
      const batchSize = 3;
      for (let i = 0; i < addresses.length; i += batchSize) {
        const batch = addresses.slice(i, i + batchSize);

        // Process each batch with promises
        await Promise.all(
          batch.map(async (address) => {
            try {
              const newBalance = await electrumBridge.getAddressBalance(address.watch_address);
              // Only mark as updated if the balance actually changed
              if (address.balance !== newBalance) {
                address.balance = newBalance;
                updated = true;
              }
            } catch (err) {
              watchAddressLogger.error(
                'Failed to update balance for address:',
                address.watch_address,
                err,
              );
            }
          }),
        );
      }

      // Save all changes at once if any updates were made
      if (updated) {
        retries = 0;
        while (retries < maxRetries) {
          try {
            await this.saveWatchedAddressesStore(userWalletAddress, addresses);
            break; // If successful, exit the retry loop
          } catch (err) {
            lastError = err;
            retries++;

            // Special handling for version change transaction errors
            const isVersionChangeError =
              err instanceof Error &&
              (err.name === 'AbortError' ||
                (err.message && err.message.includes('Version change')));

            if (isVersionChangeError) {
              watchAddressLogger.warn(
                `IndexedDB version change detected while saving refreshed balances, retry ${retries}/${maxRetries}`,
              );
              // Wait a bit longer for version changes
              await new Promise((resolve) => setTimeout(resolve, 350 * retries));
            } else {
              watchAddressLogger.warn(
                `Retry ${retries}/${maxRetries} saving refreshed balances:`,
                err,
              );
              // Standard backoff for other errors
              await new Promise((resolve) => setTimeout(resolve, 200 * retries));
            }

            if (retries >= maxRetries) {
              watchAddressLogger.error(
                'Failed to save refreshed balances after maximum retries:',
                lastError,
              );
              return false;
            }
          }
        }
      }

      return true;
    } catch (error) {
      watchAddressLogger.error('Error in refreshWatchAddressBalances:', error);
      return false;
    }
  }

  /**
   * Get all watched addresses across all wallets
   * This method aggregates watched addresses from all wallets into a single list
   */
  static async getAllWatchedAddresses(): Promise<WatchAddress[]> {
    try {
      // Get all wallets from storage
      const wallets = await StorageService.getAllWallets();

      if (!wallets || wallets.length === 0) {
        watchAddressLogger.debug('No wallets found when getting all watched addresses');
        return [];
      }

      // Aggregate watched addresses from all wallets
      const allAddresses: WatchAddress[] = [];

      for (const wallet of wallets) {
        if (wallet.address) {
          const walletAddresses = await this.getWatchedAddresses(wallet.address);
          allAddresses.push(...walletAddresses);
        }
      }

      // Refresh balances for all addresses
      if (allAddresses.length > 0) {
        // Use a Set to get unique user wallet addresses
        const uniqueUserWallets = new Set(allAddresses.map((addr) => addr.user_wallet_address));

        // Refresh balances for each unique user wallet
        await Promise.all(
          Array.from(uniqueUserWallets).map((userWalletAddress) =>
            this.refreshWatchAddressBalances(userWalletAddress),
          ),
        );
      }

      watchAddressLogger.debug(
        `Found ${allAddresses.length} total watched addresses across all wallets`,
      );
      return allAddresses;
    } catch (error) {
      watchAddressLogger.error('Error getting all watched addresses:', error);
      return [];
    }
  }
}

export default WatchAddressService;
