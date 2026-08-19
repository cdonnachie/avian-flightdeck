import { describe, expect, it } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';

import { avianNetwork } from './WalletService';
import {
  buildAssetTransferScript,
  buildIssuanceScript,
  buildOwnerScript,
  buildReissueScript,
  parseAssetScript,
  ASSET_MARKER,
  REISSUE_UNITS_UNCHANGED,
} from './assetScript';
import { isAssetScript, OP_AVN_ASSET } from './psbt';

/**
 * Byte-exact asset transfer scripts. The golden vector below is assembled independently from the
 * Avian Core format (assettypes.h / assets.cpp) — marker "rvn" ‖ 't' ‖ compactSize(name) ‖ name ‖
 * int64LE(amount), wrapped as P2PKH ‖ OP_AVN_ASSET ‖ push ‖ OP_DROP — so it cross-checks the builder
 * rather than merely round-tripping it. Getting this wrong builds unrecoverable assets, so it is the
 * most safety-critical module in asset support.
 */

const ADDR = 'RJNi221gkDstBPUxeeJgtmDY4EXMEj6uvF';

/** Independently construct the expected transfer script from first principles. */
function expectedTransferScript(address: string, name: string, amount: bigint): Buffer {
  const p2pkh = bitcoin.address.toOutputScript(address, avianNetwork);
  const nameBuf = Buffer.from(name, 'ascii');
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigInt64LE(amount);
  const payload = Buffer.concat([
    Buffer.from([0x72, 0x76, 0x6e]), // "rvn"
    Buffer.from([0x74]), // 't'
    Buffer.from([nameBuf.length]), // compactSize (names are short → 1 byte)
    nameBuf,
    amountBuf,
  ]);
  const push = Buffer.concat([Buffer.from([payload.length]), payload]); // direct push (<76 bytes)
  return Buffer.concat([p2pkh, Buffer.from([OP_AVN_ASSET]), push, Buffer.from([0x75])]);
}

describe('buildAssetTransferScript', () => {
  it('matches a byte-exact golden vector for a plain transfer', () => {
    const built = buildAssetTransferScript(ADDR, 'SMAUG', 1000n);
    expect(built.toString('hex')).toBe(expectedTransferScript(ADDR, 'SMAUG', 1000n).toString('hex'));
  });

  it('starts with a spendable 25-byte P2PKH and carries the rvn marker', () => {
    const built = buildAssetTransferScript(ADDR, 'CRAIG_KINGDOM', 1n);
    // The P2PKH prefix is exactly the plain output script for the address.
    expect(built.subarray(0, 25).toString('hex')).toBe(
      bitcoin.address.toOutputScript(ADDR, avianNetwork).toString('hex'),
    );
    expect(built[25]).toBe(OP_AVN_ASSET); // 0xc0
    expect(isAssetScript(built)).toBe(true);
    // The marker inside the pushed payload is "rvn", never "avn".
    expect(built.includes(ASSET_MARKER)).toBe(true);
    expect(built.includes(Buffer.from('avn', 'ascii'))).toBe(false);
  });

  it('encodes the amount as an 8-byte little-endian integer', () => {
    const built = buildAssetTransferScript(ADDR, 'A', 0x0102030405n);
    const parsed = parseAssetScript(built)!;
    expect(parsed.amount).toBe(0x0102030405n);
  });

  it('rejects a bech32 (non-P2PKH) address — assets are legacy-address only', () => {
    // A valid Avian bech32 address (P2WPKH) — not allowed to carry an asset.
    const p2wpkh = bitcoin.payments.p2wpkh({
      hash: Buffer.alloc(20, 7),
      network: avianNetwork,
    }).address!;
    expect(() => buildAssetTransferScript(p2wpkh, 'SMAUG', 1n)).toThrow(/legacy P2PKH/);
  });

  it('rejects a non-positive amount', () => {
    expect(() => buildAssetTransferScript(ADDR, 'SMAUG', 0n)).toThrow(/positive/);
  });
});

describe('parseAssetScript', () => {
  it('round-trips a transfer (type, name, amount, address)', () => {
    const built = buildAssetTransferScript(ADDR, 'SMAUG', 1000n);
    const parsed = parseAssetScript(built);
    expect(parsed).toMatchObject({ type: 'transfer', name: 'SMAUG', amount: 1000n, address: ADDR });
  });

  it('round-trips unique (NAME#tag) and sub (PARENT/CHILD) names', () => {
    for (const name of ['AVIANMEMECONTEST#7_OF_100', 'CRAIG_KINGDOM/SUB']) {
      const parsed = parseAssetScript(buildAssetTransferScript(ADDR, name, 1n));
      expect(parsed?.name).toBe(name);
      expect(parsed?.type).toBe('transfer');
    }
  });

  it('returns null for a plain (non-asset) P2PKH', () => {
    const plain = bitcoin.address.toOutputScript(ADDR, avianNetwork);
    expect(parseAssetScript(plain)).toBeNull();
  });
});

describe('buildReissueScript', () => {
  // Independently construct the expected reissue payload from Core's CReissueAsset format:
  // "rvn" · 'r' · compactSize(name) · name · int64LE(amount) · int8(units) · int8(reissuable) ·
  // [ipfs] · 0x00 (empty ANSID). No hasIPFS/hasANS flags (unlike CNewAsset).
  function expectedReissue(name: string, amount: bigint, units: number, reissuable: boolean): Buffer {
    const p2pkh = bitcoin.address.toOutputScript(ADDR, avianNetwork);
    const nameBuf = Buffer.from(name, 'ascii');
    const amountBuf = Buffer.alloc(8);
    amountBuf.writeBigInt64LE(amount);
    const payload = Buffer.concat([
      Buffer.from([0x72, 0x76, 0x6e, 0x72]), // rvn + 'r'
      Buffer.from([nameBuf.length]),
      nameBuf,
      amountBuf,
      Buffer.from([units & 0xff]),
      Buffer.from([reissuable ? 1 : 0]),
      Buffer.from([0x00]), // empty ANSID
    ]);
    const push = Buffer.concat([Buffer.from([payload.length]), payload]);
    return Buffer.concat([p2pkh, Buffer.from([OP_AVN_ASSET]), push, Buffer.from([0x75])]);
  }

  it('matches an independent construction (mint more supply, units unchanged)', () => {
    const built = buildReissueScript(ADDR, {
      name: 'FLIGHTDECK',
      amount: 1000n * 100_000_000n,
      units: -1, // unchanged → 0xff
      reissuable: true,
    });
    expect(built.toString('hex')).toBe(
      expectedReissue('FLIGHTDECK', 1000n * 100_000_000n, -1, true).toString('hex'),
    );
    // -1 units serialize as 0xff.
    expect(built.includes(Buffer.from([0xff, 0x01, 0x00]))).toBe(true);
  });

  it('parses back as a reissue with its name and amount', () => {
    const built = buildReissueScript(ADDR, { name: 'SMAUG', amount: 5n * 100_000_000n, units: 0, reissuable: false });
    expect(parseAssetScript(built)).toMatchObject({
      type: 'reissue',
      name: 'SMAUG',
      amount: 5n * 100_000_000n,
    });
  });

  it('allows a metadata-only reissue (amount 0)', () => {
    expect(() => buildReissueScript(ADDR, { name: 'SMAUG', amount: 0n, units: -1, reissuable: false })).not.toThrow();
  });

  it('reproduces a real Core reissue (CRAIG_KINGDOM +1, units unchanged) byte-for-byte', () => {
    // The reissue output of a real Avian Core CRAIG_KINGDOM reissue: +1 supply, units unchanged
    // (0xff), stays reissuable. Definitive validation of the 100-AVN-burn reissue path.
    const DEST = 'RBzWECT1sEKDVfQBH8aJDrv7pnDrXKA9E9';
    expect(
      buildReissueScript(DEST, {
        name: 'CRAIG_KINGDOM',
        amount: 100_000_000n,
        units: -1, // unchanged → 0xff
        reissuable: true,
      }).toString('hex'),
    ).toBe(
      '76a9141dc074e3cc3747909b016fb0adb604ee19ef87f188acc01d72766e720d43524149475f4b494e47444f4d00e1f50500000000ff010075',
    );
  });
});

describe('real mainnet Core golden vectors', () => {
  // Output scripts lifted from a real Avian Core asset-issuance transaction (creating FLIGHTDECK).
  // These pin the parser to what Core actually emits on mainnet.
  const OWNER = 'RXt29uFKBr8RnyUqyp7m71S4DXPtauYyXm';
  const ownerScript = Buffer.from(
    '76a914f7e90a9c1fd4bacfd771b70152e3ecf775697f2b88acc01072766e6f0b464c494748544445434b2175',
    'hex',
  );
  const issueScript = Buffer.from(
    '76a914f7e90a9c1fd4bacfd771b70152e3ecf775697f2b88acc01b72766e710a464c494748544445434b00e1f505000000000001000075',
    'hex',
  );

  it('parses a real owner token (type o, no amount)', () => {
    expect(parseAssetScript(ownerScript)).toEqual({
      type: 'owner',
      address: OWNER,
      name: 'FLIGHTDECK!',
      amount: null,
    });
  });

  it('parses a real new-asset issuance (type q, with amount)', () => {
    // 'q' (0x71) is issuance — the label the parser bug used to get wrong.
    expect(parseAssetScript(issueScript)).toEqual({
      type: 'issue',
      address: OWNER,
      name: 'FLIGHTDECK',
      amount: 100_000_000n, // qty 1, scaled by 10^8
    });
  });

  it('builds an owner-token output byte-identical to Core’s FLIGHTDECK owner output', () => {
    expect(buildOwnerScript(OWNER, 'FLIGHTDECK').toString('hex')).toBe(ownerScript.toString('hex'));
  });

  it('builds a new-asset output byte-identical to Core’s FLIGHTDECK issuance', () => {
    // FLIGHTDECK was issued with 1 unit, 0 divisions, reissuable, no IPFS/ANS.
    const built = buildIssuanceScript(OWNER, {
      name: 'FLIGHTDECK',
      amount: 100_000_000n,
      units: 0,
      reissuable: true,
    });
    expect(built.toString('hex')).toBe(issueScript.toString('hex'));
  });

  it('builds a transfer whose name+amount bytes match Core’s real encoding', () => {
    // The issuance payload is "rvn" ‖ 'q' ‖ compactSize(name) ‖ name ‖ int64LE(amount) ‖ …extra.
    // A transfer is "rvn" ‖ 't' ‖ compactSize(name) ‖ name ‖ int64LE(amount) — the name+amount run
    // is identical, so our builder must produce exactly those bytes.
    const built = buildAssetTransferScript(OWNER, 'FLIGHTDECK', 100_000_000n);
    const nameAndAmount = Buffer.from('0a464c494748544445434b00e1f50500000000', 'hex');
    expect(built.includes(nameAndAmount)).toBe(true);
    expect(issueScript.includes(nameAndAmount)).toBe(true);
  });

  it('builds a transfer byte-identical to a real Core SMAUG transfer output', () => {
    // The transfer output of a real Avian Core SMAUG transfer (1.0 SMAUG, type 't'). This is the
    // definitive check: our builder must reproduce Core's transfer script exactly, or an asset move
    // could be malformed and unrecoverable.
    const RECIPIENT_ADDR = 'RWdrtiny9B5zGcyVzjyZtj4sLhZpn2XQfL';
    const realTransfer =
      '76a914ea435c63940947432bfa2c53263c6d9ad82a163788acc01272766e7405534d41554700e1f5050000000075';

    expect(parseAssetScript(Buffer.from(realTransfer, 'hex'))).toEqual({
      type: 'transfer',
      address: RECIPIENT_ADDR,
      name: 'SMAUG',
      amount: 100_000_000n, // 1.0 SMAUG
    });
    expect(buildAssetTransferScript(RECIPIENT_ADDR, 'SMAUG', 100_000_000n).toString('hex')).toBe(
      realTransfer,
    );
  });

  // Sub and unique issuances differ on the owner token: a SUB gets its own CHILD! owner (rvn·o),
  // a UNIQUE does NOT — a unique inherits authority from its parent root owner and creates only the
  // parent-owner transfer (rvn·t) + the new asset (rvn·q). Emitting a NAME#unique! owner output is
  // rejected by consensus and split the chain (see issueChildAsset / the 5.0.3 fix).
  it('reproduces a real Core UNIQUE issuance (FLIGHTDECK#TEST) byte-for-byte — no owner token', () => {
    const PARENT_OWNER_DEST = 'RGAFrTpnpPWtT1UBxuxzuB8xMg9mxiq8Ah';
    const UNIQUE_DEST = 'RV3Tjt8ZLnuahSL9QjTtVxLKBR7CQCfv49';
    expect(buildAssetTransferScript(PARENT_OWNER_DEST, 'FLIGHTDECK!', 100_000_000n).toString('hex')).toBe(
      '76a9144b791eb36f35affad78c1ef45461da116e91d77988acc01872766e740b464c494748544445434b2100e1f5050000000075',
    );
    expect(
      buildIssuanceScript(UNIQUE_DEST, {
        name: 'FLIGHTDECK#TEST',
        amount: 100_000_000n,
        units: 0,
        reissuable: false, // uniques are non-reissuable
      }).toString('hex'),
    ).toBe(
      '76a914d8c9c40901617159d1ad92822da95f7ce4ca262988acc02072766e710f464c494748544445434b235445535400e1f505000000000000000075',
    );
  });

  it('reproduces a real Core SUB issuance (FLIGHTDECK/TEST) byte-for-byte', () => {
    const PARENT_OWNER_DEST = 'RQJ2bz6D998ex9fgwjEvCRH9dYHX3W84a7';
    const SUB_DEST = 'RLujp8qVJ9upSyDNU9TL8nv3mNQW82MDAm';
    expect(buildAssetTransferScript(PARENT_OWNER_DEST, 'FLIGHTDECK!', 100_000_000n).toString('hex')).toBe(
      '76a914a4b264c6f967c76dfdef657a8f6cfbf677e9fb1f88acc01872766e740b464c494748544445434b2100e1f5050000000075',
    );
    expect(buildOwnerScript(SUB_DEST, 'FLIGHTDECK/TEST').toString('hex')).toBe(
      '76a9147f92d9617eeb5fc717eb8d3c431b237f0caad14a88acc01572766e6f10464c494748544445434b2f544553542175',
    );
    expect(
      buildIssuanceScript(SUB_DEST, {
        name: 'FLIGHTDECK/TEST',
        amount: 100_000_000n,
        units: 0,
        reissuable: true, // this sub was issued reissuable
      }).toString('hex'),
    ).toBe(
      '76a9147f92d9617eeb5fc717eb8d3c431b237f0caad14a88acc02072766e710f464c494748544445434b2f5445535400e1f505000000000001000075',
    );
  });

  it('reproduces a real Core issuance with an IPFS hash byte-for-byte', () => {
    // FLIGHTDECK#001 (unique) issued with IPFS QmaQdhp16ksqeEQMfArTux8bjeBaJmAxi8JpnSCSgSEsQ3. The
    // hash decodes (base58) to 0x12 0x20 ‖ 32-byte sha256, appended after hasIPFS=01.
    const DEST = 'RAqL1E1MhbDbAWWdo9pugcvdP2GAt7SWSH';
    expect(
      buildIssuanceScript(DEST, {
        name: 'FLIGHTDECK#001',
        amount: 100_000_000n,
        units: 0,
        reissuable: false,
        ipfs: 'QmaQdhp16ksqeEQMfArTux8bjeBaJmAxi8JpnSCSgSEsQ3',
      }).toString('hex'),
    ).toBe(
      '76a914110c0d88b13de35be9708cf83bc76366c2545dd788acc04172766e710e464c494748544445434b2330303100e1f505000000000000011220b3516e0d37699ee67d4d79560b0abc3e99ec2485bb1f326a3eaa5f05e5f8aaf80075',
    );
  });
});

/**
 * Scripts from three transactions this wallet built and Avian Core accepted via
 * `testmempoolaccept` on BOTH 5.0.3 and 4.2.0 — the two versions that disagreed during the
 * consensus incident. They pin the shapes that split the chain:
 *
 *   - a unique issuance has NO owner token of its own,
 *   - a sub-asset issuance DOES have one,
 *   - a reissue leaves divisions alone with the 0xff "units unchanged" sentinel.
 *
 * Unlike the vectors above (lifted from Core's own issuances), these are our bytes, blessed by
 * Core's validator. A regression here is not a formatting nit — it is a transaction the network
 * splits over, or an asset redefined by accident.
 */
describe('consensus-accepted golden vectors (5.0.3 and 4.2.0)', () => {
  // Every output below pays this address; the wallet was anchored to it by descriptor import.
  const HOLDER = 'RChTMyBr6eqFbS1W5WQoJmeCyuEDDpnXuN';
  const P2PKH = '76a914257f1e5d22e45ae6f576de62011268f68b95cce588ac';

  it('builds the accepted BRAND.AVN#001 unique with no owner token of its own', () => {
    // txid 3bd8a804…c4f6. The absent NAME#unique! owner output is the whole point: emitting one
    // is what 4.2.0 rejected and 5.0.x once accepted.
    expect(
      buildIssuanceScript(HOLDER, {
        name: 'BRAND.AVN#001',
        amount: 100_000_000n,
        units: 0,
        reissuable: false,
      }).toString('hex'),
    ).toBe(
      P2PKH + 'c01e72766e710d4252414e442e41564e2330303100e1f505000000000000000075',
    );
  });

  it('builds the accepted BRAND.AVN/SUB sub-asset and its own owner token', () => {
    // txid 8254013a…b363, the complement of the unique above: a sub-asset legitimately carries a
    // CHILD! owner token, emitted second-to-last.
    expect(buildOwnerScript(HOLDER, 'BRAND.AVN/SUB').toString('hex')).toBe(
      P2PKH + 'c01372766e6f0e4252414e442e41564e2f5355422175',
    );
    expect(
      buildIssuanceScript(HOLDER, {
        name: 'BRAND.AVN/SUB',
        amount: 100_000_000n,
        units: 0,
        reissuable: true,
      }).toString('hex'),
    ).toBe(
      P2PKH + 'c01e72766e710d4252414e442e41564e2f53554200e1f505000000000001000075',
    );
  });

  it('builds the accepted CRAIGD.AVN reissue, leaving divisions unchanged', () => {
    // txid 04efba89…9f98. units = 0xff is the "leave divisions alone" sentinel; encoding a 0 here
    // instead would silently redefine the asset's divisibility.
    expect(
      buildReissueScript(HOLDER, {
        name: 'CRAIGD.AVN',
        amount: 1_000_000_000n, // +10.0
        units: REISSUE_UNITS_UNCHANGED,
        reissuable: true,
      }).toString('hex'),
    ).toBe(P2PKH + 'c01a72766e720a4352414947442e41564e00ca9a3b00000000ff010075');
  });

  it('builds the parent owner-token transfer these issuances return to self', () => {
    expect(buildAssetTransferScript(HOLDER, 'BRAND.AVN!', 100_000_000n).toString('hex')).toBe(
      P2PKH + 'c01772766e740a4252414e442e41564e2100e1f5050000000075',
    );
  });
});
