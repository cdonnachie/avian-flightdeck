import { describe, expect, it } from 'vitest';

import {
  accountsFor,
  findPermission,
  grantPermission,
  hasPermission,
  removeAccountEverywhere,
  revokePermission,
  sanitizePermissions,
  touchPermission,
} from './permissions';
import { OriginPermission } from '@/types/avianConnect';

const ADDRESS_A = 'RAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDRESS_B = 'RBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const permission = (overrides: Partial<OriginPermission> = {}): OriginPermission => ({
  origin: 'https://realm.example',
  accounts: [ADDRESS_A],
  grantedAt: 1000,
  lastUsedAt: 1000,
  ...overrides,
});

describe('sanitizePermissions', () => {
  it('returns an empty list for anything that is not an array', () => {
    expect(sanitizePermissions(null)).toEqual([]);
    expect(sanitizePermissions(undefined)).toEqual([]);
    expect(sanitizePermissions({ origin: 'https://realm.example' })).toEqual([]);
  });

  it('normalises stored origins', () => {
    const [result] = sanitizePermissions([permission({ origin: 'https://Realm.Example/' })]);
    expect(result.origin).toBe('https://realm.example');
  });

  it('drops records that could not grant anything meaningful', () => {
    const result = sanitizePermissions([
      permission({ origin: 'not-a-url' }),
      permission({ origin: 'http://realm.example' }), // plaintext, non-local
      permission({ accounts: [] }),
      permission({ accounts: 'R9' as unknown as string[] }),
      null,
      'nonsense',
    ]);
    expect(result).toEqual([]);
  });

  it('keeps only the first record per origin', () => {
    const result = sanitizePermissions([
      permission({ accounts: [ADDRESS_A] }),
      permission({ accounts: [ADDRESS_B] }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].accounts).toEqual([ADDRESS_A]);
  });

  it('defaults missing timestamps instead of dropping the record', () => {
    const [result] = sanitizePermissions([
      { origin: 'https://realm.example', accounts: [ADDRESS_A] },
    ]);
    expect(result.grantedAt).toBe(0);
    expect(result.lastUsedAt).toBe(0);
  });
});

describe('lookup', () => {
  const permissions = [permission()];

  it('matches regardless of how the origin is written', () => {
    expect(findPermission(permissions, 'https://REALM.example/page')?.origin).toBe(
      'https://realm.example',
    );
    expect(hasPermission(permissions, 'https://realm.example')).toBe(true);
  });

  it('does not match a different origin', () => {
    expect(findPermission(permissions, 'https://evil.example')).toBeNull();
    expect(hasPermission(permissions, 'https://realm.example:8443')).toBe(false);
    expect(hasPermission(permissions, 'garbage')).toBe(false);
  });

  it('exposes only the accounts granted to that origin', () => {
    const list = [permission(), permission({ origin: 'https://other.example', accounts: [ADDRESS_B] })];
    expect(accountsFor(list, 'https://realm.example')).toEqual([ADDRESS_A]);
    expect(accountsFor(list, 'https://unknown.example')).toEqual([]);
  });
});

describe('grantPermission', () => {
  it('adds a new record', () => {
    const result = grantPermission([], 'https://realm.example/game', [ADDRESS_A], 5000);
    expect(result).toEqual([
      { origin: 'https://realm.example', accounts: [ADDRESS_A], grantedAt: 5000, lastUsedAt: 5000 },
    ]);
  });

  it('replaces the exposed accounts but keeps the original grant date', () => {
    const result = grantPermission([permission()], 'https://realm.example', [ADDRESS_B], 9000);
    expect(result).toHaveLength(1);
    expect(result[0].accounts).toEqual([ADDRESS_B]);
    expect(result[0].grantedAt).toBe(1000);
    expect(result[0].lastUsedAt).toBe(9000);
  });

  it('de-duplicates accounts and ignores junk entries', () => {
    const result = grantPermission([], 'https://realm.example', [ADDRESS_A, ADDRESS_A, ''], 1);
    expect(result[0].accounts).toEqual([ADDRESS_A]);
  });

  it('refuses to grant to an unusable origin or with no accounts', () => {
    expect(grantPermission([], 'javascript:alert(1)', [ADDRESS_A], 1)).toEqual([]);
    expect(grantPermission([], 'https://realm.example', [], 1)).toEqual([]);
  });

  it('leaves other origins untouched', () => {
    const other = permission({ origin: 'https://other.example' });
    const result = grantPermission([other], 'https://realm.example', [ADDRESS_A], 1);
    expect(result).toHaveLength(2);
    expect(result).toContain(other);
  });
});

describe('revokePermission', () => {
  it('removes exactly the named origin', () => {
    const list = [permission(), permission({ origin: 'https://other.example' })];
    const result = revokePermission(list, 'https://realm.example/somewhere');
    expect(result.map((entry) => entry.origin)).toEqual(['https://other.example']);
  });

  it('is a no-op for unknown or unusable origins', () => {
    const list = [permission()];
    expect(revokePermission(list, 'https://unknown.example')).toEqual(list);
    expect(revokePermission(list, 'nonsense')).toEqual(list);
  });

  it('makes the origin unrecognised afterwards', () => {
    const result = revokePermission([permission()], 'https://realm.example');
    expect(hasPermission(result, 'https://realm.example')).toBe(false);
    expect(accountsFor(result, 'https://realm.example')).toEqual([]);
  });
});

describe('touchPermission', () => {
  it('updates only lastUsedAt for the matching origin', () => {
    const list = [permission(), permission({ origin: 'https://other.example' })];
    const [touched, untouched] = touchPermission(list, 'https://realm.example', 7777);
    expect(touched.lastUsedAt).toBe(7777);
    expect(touched.grantedAt).toBe(1000);
    expect(untouched.lastUsedAt).toBe(1000);
  });
});

describe('removeAccountEverywhere', () => {
  it('drops the account from every origin and removes origins left empty', () => {
    const list = [
      permission({ accounts: [ADDRESS_A, ADDRESS_B] }),
      permission({ origin: 'https://other.example', accounts: [ADDRESS_A] }),
    ];
    const result = removeAccountEverywhere(list, ADDRESS_A);
    expect(result).toHaveLength(1);
    expect(result[0].origin).toBe('https://realm.example');
    expect(result[0].accounts).toEqual([ADDRESS_B]);
  });
});
