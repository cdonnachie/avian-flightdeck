import { describe, expect, it } from 'vitest';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';

import {
  avianNetwork,
  buildDescriptorBody,
  descriptorChecksum,
  WalletService,
} from './WalletService';
import { TEST_MNEMONIC } from '@/test/helpers';

const bip32 = BIP32Factory(ecc);

/** Account-level xpub for the published test mnemonic, at m/44'/921'/0'. */
const accountNode = bip32
  .fromSeed(bip39.mnemonicToSeedSync(TEST_MNEMONIC), avianNetwork)
  .derivePath("m/44'/921'/0'");
const XPUB = accountNode.neutered().toBase58();
const XPRV = accountNode.toBase58();
const FINGERPRINT = 'deadbeef';

describe('buildDescriptorBody', () => {
  it('wraps the key according to the script type', () => {
    expect(buildDescriptorBody('p2pkh', FINGERPRINT, 44, 921, XPUB)).toBe(
      `pkh([${FINGERPRINT}/44h/921h/0h]${XPUB}/0/*)`,
    );
    expect(buildDescriptorBody('p2wpkh', FINGERPRINT, 84, 921, XPUB)).toBe(
      `wpkh([${FINGERPRINT}/84h/921h/0h]${XPUB}/0/*)`,
    );
    expect(buildDescriptorBody('p2sh-p2wpkh', FINGERPRINT, 49, 921, XPUB)).toBe(
      `sh(wpkh([${FINGERPRINT}/49h/921h/0h]${XPUB}/0/*))`,
    );
  });

  it('carries the coin type through, so Ravencoin-legacy wallets stay distinguishable', () => {
    expect(buildDescriptorBody('p2pkh', FINGERPRINT, 44, 175, XPUB)).toContain('/44h/175h/0h]');
  });
});

describe('descriptorChecksum', () => {
  const body = buildDescriptorBody('p2pkh', FINGERPRINT, 44, 921, XPUB);

  it('returns eight characters from the bech32 charset', () => {
    const checksum = descriptorChecksum(body);
    expect(checksum).toHaveLength(8);
    expect(checksum).toMatch(/^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{8}$/);
  });

  it('is deterministic', () => {
    expect(descriptorChecksum(body)).toBe(descriptorChecksum(body));
  });

  it('changes when any part of the descriptor changes', () => {
    const checksums = new Set([
      descriptorChecksum(buildDescriptorBody('p2pkh', FINGERPRINT, 44, 921, XPUB)),
      descriptorChecksum(buildDescriptorBody('p2wpkh', FINGERPRINT, 84, 921, XPUB)),
      descriptorChecksum(buildDescriptorBody('p2pkh', 'cafebabe', 44, 921, XPUB)),
      descriptorChecksum(buildDescriptorBody('p2pkh', FINGERPRINT, 44, 175, XPUB)),
    ]);
    expect(checksums.size).toBe(4);
  });

  it('detects a single transposed character, which is the point of the checksum', () => {
    const swapped = body.replace('pkh(', 'pkh(').replace(/\/0\/\*\)$/, '/1/*)');
    expect(descriptorChecksum(swapped)).not.toBe(descriptorChecksum(body));
  });

  it('reports an unrepresentable descriptor rather than a plausible-looking checksum', () => {
    expect(descriptorChecksum('pkh(💥)')).toBe('????????');
  });
});

describe('parseDescriptor', () => {
  const withChecksum = (bodyText: string) => `${bodyText}#${descriptorChecksum(bodyText)}`;

  it('parses a full origin expression for each script type', () => {
    const cases = [
      { type: 'p2pkh' as const, purpose: 44 },
      { type: 'p2wpkh' as const, purpose: 84 },
      { type: 'p2sh-p2wpkh' as const, purpose: 49 },
    ];

    for (const { type, purpose } of cases) {
      const parsed = WalletService.parseDescriptor(
        withChecksum(buildDescriptorBody(type, FINGERPRINT, purpose, 921, XPUB)),
      );

      expect(parsed.addrType).toBe(type);
      expect(parsed.xkey).toBe(XPUB);
      expect(parsed.isPrivate).toBe(false);
      expect(parsed.fingerprint).toBe(FINGERPRINT);
      expect(parsed.purpose).toBe(purpose);
      expect(parsed.coinType).toBe(921);
      expect(parsed.accountIndex).toBe(0);
    }
  });

  it('round-trips whatever buildDescriptorBody produced', () => {
    const body = buildDescriptorBody('p2wpkh', FINGERPRINT, 84, 175, XPUB);
    const parsed = WalletService.parseDescriptor(withChecksum(body));

    expect(buildDescriptorBody(parsed.addrType, parsed.fingerprint, parsed.purpose, parsed.coinType, parsed.xkey)).toBe(
      body,
    );
  });

  it('accepts a descriptor with no checksum attached', () => {
    const parsed = WalletService.parseDescriptor(
      buildDescriptorBody('p2pkh', FINGERPRINT, 44, 921, XPUB),
    );
    expect(parsed.xkey).toBe(XPUB);
  });

  it('recognises an xprv and flags it as private', () => {
    const parsed = WalletService.parseDescriptor(
      withChecksum(buildDescriptorBody('p2pkh', FINGERPRINT, 44, 921, XPRV)),
    );
    expect(parsed.isPrivate).toBe(true);
    expect(parsed.xkey.startsWith('xprv')).toBe(true);
  });

  it("accepts apostrophes as well as h for hardened levels", () => {
    const parsed = WalletService.parseDescriptor(`pkh([${FINGERPRINT}/44'/921'/0']${XPUB}/0/*)`);
    expect(parsed.purpose).toBe(44);
    expect(parsed.coinType).toBe(921);
  });

  it('lower-cases the fingerprint so comparisons do not depend on how it was typed', () => {
    const parsed = WalletService.parseDescriptor(`pkh([DEADBEEF/44h/921h/0h]${XPUB}/0/*)`);
    expect(parsed.fingerprint).toBe('deadbeef');
  });

  it('reads a non-zero account index', () => {
    const parsed = WalletService.parseDescriptor(`pkh([${FINGERPRINT}/44h/921h/3h]${XPUB}/0/*)`);
    expect(parsed.accountIndex).toBe(3);
  });

  describe('bare keys without an origin expression', () => {
    it('infers the BIP path from the script type when there is no inline path', () => {
      expect(WalletService.parseDescriptor(`pkh(${XPUB}/0/*)`)).toMatchObject({
        purpose: 44,
        coinType: 921,
        accountIndex: 0,
        fingerprint: '00000000',
      });
      expect(WalletService.parseDescriptor(`wpkh(${XPUB}/0/*)`)).toMatchObject({ purpose: 84 });
      expect(WalletService.parseDescriptor(`sh(wpkh(${XPUB}/0/*))`)).toMatchObject({ purpose: 49 });
    });

    it('reads a full inline hardened path and reports the account derivation path', () => {
      const parsed = WalletService.parseDescriptor(`pkh(${XPRV}/44h/921h/2h/0/*)`);

      expect(parsed.purpose).toBe(44);
      expect(parsed.coinType).toBe(921);
      expect(parsed.accountIndex).toBe(2);
      expect(parsed.accountDerivationPath).toBe("m/44'/921'/2'");
      expect(parsed.isPrivate).toBe(true);
    });

    it('defaults the account to zero when only purpose and coin type are inline', () => {
      const parsed = WalletService.parseDescriptor(`wpkh(${XPRV}/84h/921h/0/*)`);

      expect(parsed.accountIndex).toBe(0);
      expect(parsed.accountDerivationPath).toBe("m/84'/921'/0'");
    });
  });

  describe('rejections', () => {
    it('refuses script types the wallet cannot spend', () => {
      expect(() => WalletService.parseDescriptor(`tr(${XPUB}/0/*)`)).toThrow(
        /Unsupported descriptor type/,
      );
      expect(() => WalletService.parseDescriptor(`combo(${XPUB})`)).toThrow(
        /Unsupported descriptor type/,
      );
      expect(() => WalletService.parseDescriptor('')).toThrow(/Unsupported descriptor type/);
    });

    it('refuses a descriptor with no extended key in it', () => {
      expect(() => WalletService.parseDescriptor('pkh(0279be667ef9dcbbac)')).toThrow(
        /must contain an xprv\/xpub key/,
      );
    });

    it('refuses an unbalanced descriptor', () => {
      expect(() => WalletService.parseDescriptor(`sh(wpkh(${XPUB}/0/*)`)).toThrow();
    });
  });
});
