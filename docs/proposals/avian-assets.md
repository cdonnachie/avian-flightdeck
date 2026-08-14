# Proposal: Avian assets in FlightDeck

Status: draft for review · Author: (proposal) · Depends on: the Avian ElectrumX asset RPC surface

## 1. Where we are

FlightDeck is **asset-blind today.** There are no asset RPCs in `ElectrumService`, no asset
handling in `UTXOSelectionService`, and no asset UI. The only asset-aware code is the defensive
`isAssetScript` guard in the PSBT engine (`src/services/wallet/psbt.ts`), which refuses to sign an
asset input.

That blindness is *why* FlightDeck has been safe: Avian's ElectrumX segregates asset UTXOs from the
plain `listunspent`, so ordinary AVN sends only ever see AVN and can't accidentally spend — and
burn — an asset. Any asset support must preserve that guarantee explicitly rather than by accident.

The gap: you hold assets (AVIANMEMECONTEST#7_OF_100, AVNELECTRUM, CRAIG_KINGDOM, SMAUG), Core shows
them, and FlightDeck can't. Closing that is the largest remaining feature gap versus Core.

## 2. Goals and non-goals

**Phase 1 — Display (read-only).** See held assets, quantities (respecting divisibility), and
metadata. Near-zero risk: you cannot burn what you only display.

**Phase 2 — Transfer (send / receive).** Send an asset to an R-address; show received assets and
asset history. This is the high-stakes phase (see §7).

**Phase 3 — Issue / reissue (deferred).** Creating assets, sub-assets, unique tokens, reissue.
Burns real AVN, has owner-token and type-zoo complexity. Out of scope until Phase 2 is proven; only
if there is demand.

Non-goals for now: restricted (`$NAME`) and qualifier (`#NAME`) assets beyond *displaying* them,
messaging channels, rewards/snapshots, ANS.

## 3. Avian asset facts (grounded in Avian Core, `c:\development\Avian`)

- **Assets live on legacy P2PKH (`R…`) addresses only** — never bech32. See [[avian-network-facts]].
- **Asset output script** = a normal 25-byte P2PKH followed by an asset tag:

  ```
  OP_DUP OP_HASH160 <20-byte pkh> OP_EQUALVERIFY OP_CHECKSIG   ← standard P2PKH (spendable)
  OP_AVN_ASSET(0xc0) <push: marker ‖ payload> OP_DROP           ← the asset rider
  ```

  `OP_AVN_ASSET = 0xc0` (confirmed `script.h:216`). `isAssetScript` already keys on byte 25 == 0xc0.

- **The marker is `rvn`, not `avn`.** `CAssetTransfer::ConstructTransaction` (`assets.cpp:1716`)
  pushes `AVN_R, AVN_V, AVN_N, <type>` = `0x72 0x76 0x6e <type>` = **"rvn" + type byte**. The
  constants are *named* `AVN_*` but their values spell `rvn` (retained Ravencoin compatibility).
  **Building `avn…` scripts would produce invalid assets** — this is the #1 gotcha.

- **Type byte:** `t` (0x74) transfer · `r` (0x72) issue/reissue · `o` (0x6f) owner · `q` (0x71)
  qualifier.

- **Payloads** (Core `CAssetTransfer` / `CNewAsset` serialization):
  - Transfer: `name`, `nAmount` (int64, scaled by units) `[, nExpireTime]` for restricted.
  - Issue: `name`, `nAmount`, `units` (0–8), `nReissuable`, `nHasIPFS` `[, ipfsHash]`.
  - Owner token: the `NAME!` token minted on issue.

- **Amounts & units:** an asset has `units` 0–8 (divisibility). On-chain amounts are integers scaled
  by `10^units`; display must format accordingly (a 0-unit asset is whole-number only).

- **Name types:** root `NAME`, sub `PARENT/CHILD`, unique `NAME#tag` (units 0, amount 1), restricted
  `$NAME`, qualifier `#NAME`. Phase 2 send targets **root, sub, and unique** first.

- **Issuing burns AVN** (~500 AVN for a root asset, per the observed `RXissueAsset` tx) and mints the
  `NAME!` owner token. Phase 3 only.

## 4. ElectrumX asset RPCs — verified, no server changes needed

Inventoried directly from the Avian ElectrumX source (`C:\development\electrumx`,
`electrumx/server/session.py`). **Everything Phase 1 and Phase 2 need is already exposed** — unlike
`get_history_rich`, no server work is required. The relevant methods:

- **`blockchain.scripthash.get_balance(scripthash, asset)`** — the `asset` arg (default `False`)
  drives the shape:
  - `False` → AVN only: `{confirmed, unconfirmed}` (integer sats). *This is what FlightDeck calls
    today (`[scriptHash]` only) — which is exactly why it's AVN-only and safe.*
  - `True` → **all balances in one call**, keyed by name:
    `{ "rvn": {confirmed, unconfirmed}, "SMAUG": {…}, "CRAIG_KINGDOM": {…}, … }`. **Note the base
    coin is keyed as `"rvn"`** (session.py:1486 maps the null asset → `'rvn'`) — alias it to AVN.
  - `"SMAUG"` / `["A","B"]` → just those. Values are integers scaled by the asset's `divisions`.
- **`blockchain.asset.get_meta(name)`** → `{ sats_in_circulation, divisions (0–8 = units), has_ipfs,
  ipfs?, reissuable, source, … }` — units for formatting, IPFS for the image, reissuable badge.
- **`blockchain.scripthash.listunspent(scripthash, asset)`** →
  `[{ tx_hash, tx_pos, height, asset: <name|null>, value }]`.
  - `False` (default) → AVN UTXOs only (asset=null). *FlightDeck's `getUTXOs` already relies on this.*
  - `"SMAUG"` → that asset's UTXOs; `True` → all. Phase 2 uses `listunspent(sh, name)` for the asset
    input and `listunspent(sh, False)` for the AVN fee inputs.
- Broadcast: the existing `blockchain.transaction.broadcast` — asset txs are ordinary txs.

Also available for later (freeze/restricted/qualifier/messaging): `blockchain.asset.get_meta_history`,
`…is_frozen`, `…verifier_string`, `…broadcasts`, `…list_addresses_by_asset`,
`…get_assets_with_prefix`, `blockchain.tag.*`, and asset/tag `…subscribe` variants.

Net: Phase 1 is **pure client work** against `get_balance(asset=True)` + `get_meta`. No server
dependency, so it can ship immediately.

## 5. Client architecture

- **`src/services/wallet/assetScript.ts` (pure, dependency-light, heavily tested).**
  - `parseAssetScript(script) → { type, name, amount, units?, reissuable?, ipfs?, expiry? } | null`
    — parse the `OP_AVN_ASSET` rider (marker check `rvn`, type byte, payload deserialize).
  - `buildTransferScript(address, name, amount) → Buffer` — P2PKH(address) + `OP_AVN_ASSET` +
    (`rvn` ‖ `t` ‖ serialize(name, amount)) + `OP_DROP`.
  - Golden-vector tested against real Core output (§7). No network, no keys.

- **`ElectrumService` additions** (thin, mirror existing methods): `getAssetBalances(address)`,
  `getAssetMeta(name)`, `getAssetUTXOs(address)` — exact signatures pinned by the §4 inventory.

- **`AssetService`** (or methods on WalletService): compose the above into a held-assets list with
  formatted quantities + metadata, with the same caching/resilience the tx sync already uses.

- **`WalletService.buildAssetTransfer(name, amount, toAddress, password)`** — a *separate*
  asset-aware builder, NOT `planSpend`:
  - Inputs: the asset UTXO(s) for `name` (covering `amount`), **plus** AVN UTXOs for the fee.
  - Outputs: asset transfer to `toAddress` (`buildTransferScript`), asset **change** back to us if
    the asset input over-covers, AVN change, and the AVN fee.
  - Reuse `planSpend`/`fees.ts` for the AVN side; the asset side is new.
  - Signs P2PKH inputs exactly as today (the asset rider doesn't change the sighash — the input is
    still a standard P2PKH spend).

- **PSBT:** the engine already refuses asset inputs. An asset-aware PSBT path can follow Phase 2 but
  is not required for it; keep the refusal as the safe default until deliberately lifted.

## 6. UI

- **Phase 1:** an "Assets" surface (list like Core's home screen) — name, quantity formatted by
  units, reissuable/units badges, IPFS image when `has_ipfs`. Search/filter as Core does.
- **Phase 2:** Send Asset (choose asset, amount bounded by held qty and units, recipient R-address),
  Receive (reuse the receive address; assets ride to any R-address), and assets in transaction
  history.

## 7. Burn-safety and test plan (non-negotiable)

The failure mode is **permanent asset loss**: a malformed script, wrong marker, or spending an asset
UTXO as plain AVN burns the asset. This phase gets *more* rigor than the fee/dust work.

- **Golden vectors:** build each script type in `assetScript.ts` and assert byte-for-byte equality
  against a transaction Core produced for the same asset/amount/address (via `createrawtransaction`
  / `decoderawtransaction` on regtest). Round-trip: parse Core's script back to the same struct.
- **Regtest first, then testnet, then a throwaway mainnet asset** — never a valuable asset on the
  first live move.
- **Never select asset UTXOs for AVN sends:** confirm the server segregates them, AND add a
  client-side guard (`isAssetScript` on every selected prevout) as defense-in-depth.
- **Explicit asset change:** verify asset-in == asset-out for every transfer test, so nothing is
  silently dropped to fee.
- Cross-wallet: build in FlightDeck → decode in Core; issue/transfer in Core → read in FlightDeck.

## 8. Proposed PR sequence (small, individually verified)

1. `assetScript.ts` — build/parse + golden-vector tests. Pure, no network. (ship)
2. ElectrumX asset RPC inventory (+ server additions if needed) → `ElectrumService` reads +
   `AssetService`. (ship)
3. Read-only **Assets** UI — **Phase 1 complete.** (ship)
4. `buildAssetTransfer` + regtest-validated tests. (ship)
5. Send / Receive asset UI + asset history — **Phase 2 complete.** (ship)
6. (deferred) issue / reissue.

Each PR bumps `package.json` per [[version-bump-per-deploy]] and deploys via the main webhook
([[deploy-on-main-webhook]]).

## 9. Open questions

1. ~~**ElectrumX surface**~~ — **Resolved (§4):** `get_balance(asset=True)`, `asset.get_meta`, and
   `listunspent(asset=…)` cover Phase 1 and Phase 2 with no server changes.
2. **v1 transfer scope** — root + sub + unique to start, with restricted/qualifier display-only?
3. **Appetite** — ship Phase 1 (display) and reassess, or commit to Phase 2 (transfers) now?
