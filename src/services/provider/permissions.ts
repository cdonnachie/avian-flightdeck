/**
 * Per-origin permission logic for Avian Connect.
 *
 * The functions here are pure and operate on a permission list; PermissionService binds them to
 * the preferences store. Keeping them separate is what makes the permission rules unit-testable
 * without IndexedDB.
 */

import { OriginPermission } from '@/types/avianConnect';
import { normalizeOrigin } from './protocol';

/**
 * Defensive read of whatever came back from storage. A corrupted or hand-edited record must not
 * be able to grant access, so anything that does not look like a permission is dropped.
 */
export function sanitizePermissions(raw: unknown): OriginPermission[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const result: OriginPermission[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;

    const candidate = entry as Partial<OriginPermission>;
    const origin = typeof candidate.origin === 'string' ? normalizeOrigin(candidate.origin) : null;
    if (!origin || seen.has(origin)) continue;

    const accounts = Array.isArray(candidate.accounts)
      ? candidate.accounts.filter(
          (account): account is string => typeof account === 'string' && account.length > 0,
        )
      : [];
    if (accounts.length === 0) continue;

    seen.add(origin);
    result.push({
      origin,
      accounts,
      grantedAt: typeof candidate.grantedAt === 'number' ? candidate.grantedAt : 0,
      lastUsedAt: typeof candidate.lastUsedAt === 'number' ? candidate.lastUsedAt : 0,
    });
  }

  return result;
}

export function findPermission(
  permissions: OriginPermission[],
  origin: string,
): OriginPermission | null {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return null;
  return permissions.find((permission) => permission.origin === normalized) || null;
}

export function hasPermission(permissions: OriginPermission[], origin: string): boolean {
  return findPermission(permissions, origin) !== null;
}

/** Accounts exposed to an origin — never the wallet's full account list. */
export function accountsFor(permissions: OriginPermission[], origin: string): string[] {
  return findPermission(permissions, origin)?.accounts || [];
}

/**
 * Grants (or re-grants) access. Re-granting replaces the exposed accounts and keeps the original
 * grantedAt, so the Connected Sites list keeps showing when the relationship started.
 */
export function grantPermission(
  permissions: OriginPermission[],
  origin: string,
  accounts: string[],
  now: number,
): OriginPermission[] {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return permissions;

  const uniqueAccounts = Array.from(
    new Set(accounts.filter((account) => typeof account === 'string' && account.length > 0)),
  );
  if (uniqueAccounts.length === 0) return permissions;

  const existing = findPermission(permissions, normalized);
  const granted: OriginPermission = {
    origin: normalized,
    accounts: uniqueAccounts,
    grantedAt: existing?.grantedAt ?? now,
    lastUsedAt: now,
  };

  return [...permissions.filter((permission) => permission.origin !== normalized), granted];
}

export function revokePermission(
  permissions: OriginPermission[],
  origin: string,
): OriginPermission[] {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return permissions;
  return permissions.filter((permission) => permission.origin !== normalized);
}

/** Records that an origin used its permission, for the "last used" column in Connected Sites. */
export function touchPermission(
  permissions: OriginPermission[],
  origin: string,
  now: number,
): OriginPermission[] {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return permissions;

  return permissions.map((permission) =>
    permission.origin === normalized ? { ...permission, lastUsedAt: now } : permission,
  );
}

/**
 * Drops an account from every origin that was allowed to see it — used when a wallet is deleted
 * so no site keeps a dangling grant. Origins left with no accounts are removed entirely.
 */
export function removeAccountEverywhere(
  permissions: OriginPermission[],
  account: string,
): OriginPermission[] {
  return permissions
    .map((permission) => ({
      ...permission,
      accounts: permission.accounts.filter((existing) => existing !== account),
    }))
    .filter((permission) => permission.accounts.length > 0);
}
