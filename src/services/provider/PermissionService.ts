/**
 * Storage-backed façade over the pure permission helpers.
 *
 * Records live in the IndexedDB preferences store and only ever describe origins the user chose
 * to remember — a one-shot approval authorises a single request and is never written here.
 */

import { StorageService } from '@/services/core/StorageService';
import { OriginPermission } from '@/types/avianConnect';
import { providerLogger } from '@/lib/Logger';
import {
  accountsFor,
  findPermission,
  grantPermission,
  removeAccountEverywhere,
  revokePermission,
  sanitizePermissions,
  touchPermission,
} from './permissions';

export class PermissionService {
  static async list(): Promise<OriginPermission[]> {
    try {
      return sanitizePermissions(await StorageService.getConnectPermissions());
    } catch (error) {
      providerLogger.error('Failed to load connect permissions:', error);
      return [];
    }
  }

  private static async save(permissions: OriginPermission[]): Promise<void> {
    await StorageService.setConnectPermissions(permissions);
    // A write resolves when its IndexedDB request succeeds, which is before the transaction
    // commits — and the redirect transport navigates away the moment a request is answered,
    // which can abort an uncommitted transaction and silently lose the grant. A read on the
    // same store cannot start until that write has committed, so this makes it durable.
    await StorageService.getConnectPermissions();
  }

  static async get(origin: string): Promise<OriginPermission | null> {
    return findPermission(await this.list(), origin);
  }

  static async accountsForOrigin(origin: string): Promise<string[]> {
    return accountsFor(await this.list(), origin);
  }

  static async grant(origin: string, accounts: string[]): Promise<void> {
    const permissions = await this.list();
    await this.save(grantPermission(permissions, origin, accounts, Date.now()));
  }

  static async revoke(origin: string): Promise<void> {
    const permissions = await this.list();
    await this.save(revokePermission(permissions, origin));
  }

  static async revokeAll(): Promise<void> {
    await this.save([]);
  }

  static async touch(origin: string): Promise<void> {
    const permissions = await this.list();
    // Nothing to record when the origin was not remembered (one-shot approval).
    if (!findPermission(permissions, origin)) return;
    await this.save(touchPermission(permissions, origin, Date.now()));
  }

  static async removeAccount(account: string): Promise<void> {
    const permissions = await this.list();
    await this.save(removeAccountEverywhere(permissions, account));
  }
}
