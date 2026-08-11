/**
 * Shared test helpers.
 */

import { IDBFactory } from 'fake-indexeddb';
import { StorageService } from '@/services/core/StorageService';
import { EnhancedUTXO } from '@/services/wallet/UTXOSelectionService';

/**
 * Gives the next test a brand new, empty IndexedDB.
 *
 * StorageService memoises its connection and its migration flag in statics, so swapping the
 * backing factory is not enough on its own — both have to be dropped or the service keeps
 * talking to the previous database.
 */
export function resetStorage(): void {
  const internals = StorageService as unknown as {
    db: IDBDatabase | null;
    migrationCompleted: boolean;
  };

  try {
    internals.db?.close();
  } catch {
    // An already-closed handle is fine; we are discarding it either way.
  }

  internals.db = null;
  internals.migrationCompleted = false;
  globalThis.indexedDB = new IDBFactory();
}

/** A password that satisfies the wallet's 8-character minimum. */
export const TEST_PASSWORD = 'correct horse battery';

/**
 * A known-good BIP39 mnemonic. This is a published test vector and must never hold funds.
 */
export const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

let utxoCounter = 0;

/** Builds a UTXO with sane defaults; override whatever the assertion is about. */
export function makeUTXO(overrides: Partial<EnhancedUTXO> = {}): EnhancedUTXO {
  utxoCounter += 1;
  return {
    txid: (overrides.txid ?? utxoCounter.toString(16).padStart(2, '0').repeat(32)).slice(0, 64),
    vout: 0,
    value: 100_000,
    confirmations: 10,
    ...overrides,
  };
}

/** Sats helper — the services work in satoshis throughout. */
export const avn = (amount: number): number => Math.round(amount * 1e8);
