import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OriginPermission } from '@/types/avianConnect';
import { PermissionService } from './PermissionService';

/** Records the order of storage calls so the write-durability barrier stays observable. */
const calls: string[] = [];
let stored: unknown = [];

vi.mock('@/services/core/StorageService', () => ({
  StorageService: {
    getConnectPermissions: async () => {
      calls.push('read');
      return stored;
    },
    setConnectPermissions: async (permissions: OriginPermission[]) => {
      calls.push('write');
      stored = permissions;
    },
  },
}));

const ORIGIN = 'https://realm.example';
const ADDRESS = 'RAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

beforeEach(() => {
  calls.length = 0;
  stored = [];
});

describe('PermissionService', () => {
  it('reads back after every write so the record is committed before a redirect', async () => {
    await PermissionService.grant(ORIGIN, [ADDRESS]);

    // IndexedDB resolves a write before its transaction commits; the trailing read is what
    // forces the commit before the redirect transport navigates away.
    expect(calls[calls.length - 2]).toBe('write');
    expect(calls[calls.length - 1]).toBe('read');
  });

  it('persists a grant that later lookups can see', async () => {
    await PermissionService.grant(ORIGIN, [ADDRESS]);

    expect(await PermissionService.accountsForOrigin(ORIGIN)).toEqual([ADDRESS]);
    expect((await PermissionService.get(ORIGIN))?.origin).toBe(ORIGIN);
  });

  it('applies the same barrier when revoking', async () => {
    await PermissionService.grant(ORIGIN, [ADDRESS]);
    calls.length = 0;

    await PermissionService.revoke(ORIGIN);

    expect(calls[calls.length - 2]).toBe('write');
    expect(calls[calls.length - 1]).toBe('read');
    expect(await PermissionService.get(ORIGIN)).toBeNull();
  });

  it('does not write when touching an origin that was never remembered', async () => {
    await PermissionService.touch(ORIGIN);
    expect(calls).not.toContain('write');
  });

  it('records use for a remembered origin', async () => {
    await PermissionService.grant(ORIGIN, [ADDRESS]);
    await PermissionService.touch(ORIGIN);

    const permission = await PermissionService.get(ORIGIN);
    expect(permission?.lastUsedAt).toBeGreaterThan(0);
  });

  it('survives a storage read failure without granting anything', async () => {
    stored = 'corrupted';
    expect(await PermissionService.list()).toEqual([]);
    expect(await PermissionService.get(ORIGIN)).toBeNull();
  });
});
