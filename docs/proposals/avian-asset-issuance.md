# Proposal: Avian asset issuance (create assets) in FlightDeck

Status: draft · Builds on: docs/proposals/avian-assets.md (transfers, shipped)

## 1. Goal

Create new Avian assets from FlightDeck: **root** (`MYASSET`), **sub** (`MYASSET/SUB`), and **unique**
(`MYASSET#tag`). Restricted (`$`), qualifier (`#…`), message-channel, and reissue are out of scope
for now.

Issuance is **irreversible and burns real AVN** (500 for a root asset), so this is the most
safety-critical asset feature — every byte is validated against real Core transactions before it can
be triggered from the UI.

## 2. Facts confirmed from Avian Core (`c:\development\Avian`)

**Burn cost + address** (`assets.cpp` GetIssue*BurnAmount / GetBurnAddress):

| Type | Burns | Burn address (mainnet) |
|---|---|---|
| Root | 500 AVN | `RXissueAssetXXXXXXXXXXXXXXXXXhhZGt` |
| Sub | 100 AVN | `RXissueSubAssetXXXXXXXXXXXXXWcwhwL` |
| Unique | 5 AVN | `RXissueUniqueAssetXXXXXXXXXXWEAe58` |

**New-asset script** = `P2PKH · OP_AVN_ASSET(0xc0) · push(payload) · OP_DROP`, value 0, where
payload = `"rvn" · 'q'(0x71) · CNewAsset`. `CNewAsset` serialization (`assettypes.h`, exact — a
mismatch builds an invalid asset):

```
compactSize(name) · name
int64LE(amount)          // 10^8-scaled
int8(units)              // 0..8 divisions
int8(reissuable)         // 0 or 1
int8(hasIPFS)            // 0 or 1
  [ SerializeIPFSHash(ipfs) if hasIPFS==1 ]
int8(hasANS)             // 0 or 1  ← easy to miss; always present
  [ ansid if hasANS==1 ]
```

Verified byte-for-byte against the real FLIGHTDECK issuance: payload
`rvnq · 0a "FLIGHTDECK" · 00e1f50500000000 · 00(units) · 01(reissuable) · 00(hasIPFS) · 00(hasANS)`.

**Owner-token script** (`ConstructOwnerTransaction`) = `P2PKH · OP_AVN_ASSET · push("rvn" · 'o'(0x6f)
· compactSize(name!) · name!) · OP_DROP`, value 0. The name carries the `!` and there is **no
amount**. Verified against FLIGHTDECK's owner output (`rvno · 0b "FLIGHTDECK!"`).

**Output ordering matters** (`asset_tx.cpp`): the **new-asset output must be LAST** and the **owner
output second-to-last**. Burn and AVN change come before them.

**Owner-token passthrough (sub/unique)** — to issue `PARENT/SUB` or `PARENT#tag` you must **own the
`PARENT!` owner token**; the tx spends it as an input and returns it via a transfer output
(`CAssetTransfer(PARENT!, 1·COIN)`), plus (for subs) mints a new `PARENT/SUB!` owner token.
`OWNER_ASSET_AMOUNT = 1·COIN`, `OWNER_TAG = "!"`.

**Name rules** (`assets.cpp`): max length 31 (30 for a root, less the type suffixes); uppercase
`A–Z 0–9` and `_ . `; not starting/ending with punctuation; unique/sub/restricted have their own
sub-rules. Full validation mirrors Core's `IsAssetNameValid`.

## 3. Client architecture

- **`assetScript.ts`** (extends the shipped, byte-validated module):
  - `buildIssuanceScript(address, { name, amount, units, reissuable, ipfs? }) → Buffer` — the
    `rvn·q` new-asset output. Golden-vector tested against FLIGHTDECK.
  - `buildOwnerScript(address, rootName) → Buffer` — the `rvn·o` owner output. Golden-vector tested.
  - `parseAssetScript` already reads `issue` (q) and `owner` (o).
- **`WalletService.issueAsset(name, { amount, units, reissuable, ipfs? }, password, options)`** —
  root issuance. Selects AVN UTXOs for `500·COIN + fee`, builds `[burn, AVN change, owner(2nd-last),
  new-asset(last)]`, signs P2PKH inputs with FORKID, broadcasts. (Sub/unique add the parent-owner
  input + passthrough — PR B.)
- **Name availability**: before building, `electrum.getAssetMeta(name)` — if it returns data the name
  is taken; issuance is refused. (Consensus still enforces this; the check is a friendly pre-flight.)

## 4. Safety / UX

- The Create-asset dialog states the **exact burn (500 AVN)** and that it is **permanent and
  irreversible**, requires the name to pass validation + availability, and gates on authentication.
- Reuses the existing auth flow; broadcasts through the connected Electrum (as the send flow does).
- Owner token is explained: creating `MYASSET` also mints `MYASSET!`, which controls reissue.

## 5. Proposed PR sequence

1. **PR A — root issuance engine**: `buildIssuanceScript` + `buildOwnerScript` (golden-vector
   validated against FLIGHTDECK), `issueAsset` builder, stub tests. No UI — mirrors how the transfer
   builder (#70) landed before its UI (#73).
2. **PR A2 — Create-asset UI**: a "Create asset" entry with name/amount/units/reissuable/IPFS,
   availability check, and the burn confirmation.
3. **PR B — sub + unique**: parent-owner passthrough + their builders/UI, validated against
   real sub/unique golden vectors from Core.

## 6. Open questions

1. Golden vectors for **sub** and **unique** issuance (real Core tx hex) to pin their exact output
   layout before PR B.
2. IPFS support in v1, or defer (issue without IPFS first)?
3. Where should "Create asset" live — a button on the Assets card header, or a menu entry?
