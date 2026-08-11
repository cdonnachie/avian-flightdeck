/**
 * Network descriptor for Avian Connect's getNetwork().
 *
 * The genesis hash is learned from the ElectrumX server the wallet is already connected to
 * rather than hard-coded, then cached locally. Phase 1 is mainnet-only.
 */

import { ElectrumService } from '@/services/core/ElectrumService';
import { StorageService } from '@/services/core/StorageService';
import { NetworkResult } from '@/types/avianConnect';
import { providerLogger } from '@/lib/Logger';

const GENESIS_HASH_PATTERN = /^[0-9a-f]{64}$/i;

export async function getNetworkDescriptor(
  electrum: ElectrumService | null,
): Promise<NetworkResult> {
  const cached = await StorageService.getCachedGenesisHash();
  if (cached && GENESIS_HASH_PATTERN.test(cached)) {
    return { network: 'mainnet', genesisHash: cached.toLowerCase() };
  }

  if (electrum) {
    try {
      const features = await electrum.getServerFeatures();
      const genesisHash = features?.genesis_hash;
      if (typeof genesisHash === 'string' && GENESIS_HASH_PATTERN.test(genesisHash)) {
        const normalized = genesisHash.toLowerCase();
        await StorageService.setCachedGenesisHash(normalized);
        return { network: 'mainnet', genesisHash: normalized };
      }
    } catch (error) {
      providerLogger.warn('Could not learn the genesis hash from the Electrum server:', error);
    }
  }

  // Documented as "unknown", not "mismatch" — dApps that pin a hash must treat null as unknown.
  return { network: 'mainnet', genesisHash: null };
}
