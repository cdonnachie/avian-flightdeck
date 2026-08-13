# Testing

Two suites, with different jobs:

| Suite | Runner | Location | Covers |
| ----- | ------ | -------- | ------ |
| Unit / service | [Vitest](https://vitest.dev) | `src/**/*.test.ts` | Crypto, coin selection, storage, classification, backup, security |
| End to end | [Playwright](https://playwright.dev) | `e2e/**/*.spec.ts` | The app in a real browser: landing, onboarding, the lock screen, balance, empty states, and Avian Connect (popups, postMessage, redirects, approval dialogs) |

```bash
pnpm test           # Vitest, run once
pnpm test:watch     # Vitest, re-run on change
pnpm test -- src/services/wallet    # a single directory
pnpm test -- -t "descriptor"        # tests matching a name

pnpm build:e2e          # static export with cheap KDF params (see below)
pnpm test:e2e           # Playwright, headless — serves out/
pnpm test:e2e:headed    # watch it drive the browser
pnpm test:e2e:ui        # Playwright's interactive UI
```

Both `build:e2e` and `test:e2e` set cheap Argon2id parameters (`NEXT_PUBLIC_ARGON2_M` /
`NEXT_PUBLIC_ARGON2_T`). The KDF is memory-hard and deliberately slow at production settings —
several seconds per unlock in a pure-WASM browser context — which blows the Playwright timeouts.
The e2e parameters keep unlocks fast and deterministic; the versioned ciphertext records the
parameters actually used, so a low-cost e2e blob and a production blob remain mutually decryptable.
Production builds set nothing and get the hardened defaults.

First-time setup for the E2E suite needs the browser binary:

```bash
pnpm exec playwright install chromium
```

## How the environment is put together

Tests run in Vitest's **node** environment, not jsdom. That is deliberate and worth understanding
before changing it: jsdom installs its own typed-array constructors, and `bitcoinjs-lib`, `ecpair`
and `tiny-secp256k1` validate their inputs with `instanceof`. Under jsdom every key operation
fails with `ecc library invalid`.

Instead, [`src/test/setup.ts`](../src/test/setup.ts) shims only the browser APIs the services
actually reach for, leaving the crypto libraries on Node's own realm:

| Shim                             | Why it is needed                                                |
| -------------------------------- | --------------------------------------------------------------- |
| `localStorage`, `sessionStorage` | StorageService migration flags, SecurityService lockout state    |
| `window`                         | Services branch on `typeof window !== 'undefined'`; this puts them on their browser paths, which is the code worth testing |
| `document`                       | SecurityService attaches activity listeners from its constructor |
| `navigator`                      | SecurityService reads `platform` and `userAgent`                 |
| `indexedDB`                      | `fake-indexeddb`, backing the whole storage layer                |
| `sonner`                         | Stubbed: toasts need a real DOM to inject a stylesheet into      |

### Test isolation

IndexedDB state does **not** reset between tests on its own, and `StorageService` memoises its
connection in a static. Any suite that touches storage must call `resetStorage()` from
[`src/test/helpers.ts`](../src/test/helpers.ts) in a `beforeEach`:

```ts
import { resetStorage } from '@/test/helpers';

beforeEach(() => {
  resetStorage();
});
```

`SecurityService` is a singleton and keeps its lock state and failed-attempt counters in memory
across tests. `SecurityService.test.ts` shows the reset dance at the top of the file.

## The end-to-end suite

Playwright drives the built app in Chromium. It exists for the things the Vitest suite structurally
cannot reach: a popup is a second real window, `postMessage` needs a real message channel, and a
redirect round trip needs real navigation.

`pnpm test:e2e` builds nothing — it serves the static export from `out/`, so **run `pnpm build:e2e`
first** after changing app code (plain `pnpm build` bakes in the slow production KDF and the unlock
steps will time out). Set `E2E_USE_DEV=1` to run against `next dev` instead.

### How a test gets a usable wallet

`e2e/fixtures.ts` provides a `walletPage` fixture that:

1. blocks WebSocket traffic, since ElectrumX is unreachable from a test machine and the app would
   otherwise sit in connection retries;
2. accepts the terms via `localStorage`;
3. seeds a wallet **straight into IndexedDB** — the encrypted key is produced by the app's own
   `secureEncrypt`, imported into the test process, so it cannot drift from the real format;
4. unlocks it through the real lock screen.

Creating a wallet is a precondition here, not the thing under test, so onboarding is bypassed.
The seeded wallet is derived from the published BIP39 test mnemonic and must never hold funds —
the same golden values the Vitest suite uses.

### Two traps worth knowing

- **The lock screen's button changes label rather than disappearing.** It reads "Unlocking…" while
  the Argon2id KDF runs, so waiting for the button to go hidden lets a test navigate away
  mid-unlock. The fixture waits for the *lock screen* to clear instead.
- **`window.open` reuses a window with the same name.** The wallet popup is named `avian-connect`,
  so if a previous popup is still open no new `popup` event fires and `waitForEvent('popup')` hangs
  until timeout. Close the popup before expecting a new one.

### What the E2E specs cover

| File | Covers |
| ---- | ------ |
| `e2e/avian-connect-popup.spec.ts` | connect, reject, signMessage with authentication, getAccounts, getNetwork, unsupported methods, and refusing a signature to an unconnected site |
| `e2e/avian-connect-redirect.spec.ts` | the redirect round trip, fragment scrubbing, challenge survival across navigation, and the origin-mismatch / malformed-request guards |
| `e2e/avian-connect-permissions.spec.ts` | remembering a site, Connected Sites, revoke, `disconnect()`, and the acceptance check that a signature verifies in Message Utilities → Verify |
| `e2e/landing.spec.ts` | the new-visitor landing page at `/` when no wallet exists |
| `e2e/onboarding.spec.ts` | the guided create-wallet wizard |
| `e2e/optional-lock.spec.ts` | the optional lock screen, the durable manual lock, and the multi-wallet unlock picker |
| `e2e/balance.spec.ts` | the dashboard balance readout when the server is unreachable — unavailable vs. last-known |
| `e2e/empty-states.spec.ts` | empty / loading states before data arrives |

The demo page carries `data-testid` hooks (`demo-address`, `demo-signature`, `demo-verification`,
`demo-log`) so the specs do not depend on its layout.

## What is covered

| Area | File | Notes |
| ---- | ---- | ----- |
| Envelope parsing, origins, redirects | `src/services/provider/protocol.test.ts` | Avian Connect wire format |
| Per-origin permissions | `src/services/provider/permissions.test.ts`, `PermissionService.test.ts` | Includes the write-durability barrier |
| Avian Connect request routing | `src/services/provider/ProviderService.test.ts` | Approval and lock enforcement |
| Sign → verify round trip | `src/services/provider/signMessage.integration.test.ts` | Real keys, real signatures |
| Network constants, address derivation, encryption, pubkey recovery | `src/services/wallet/crypto.test.ts` | |
| BIP380 descriptors | `src/services/wallet/descriptors.test.ts` | Build, checksum, parse, round trip |
| HD derivation | `src/services/wallet/derivation.test.ts` | Golden vectors — see below |
| Wallet creation and imports | `src/services/wallet/walletCreation.test.ts` | Mnemonic, private key and descriptor imports |
| Coin selection | `src/services/wallet/UTXOSelectionService.test.ts` | All six strategies |
| Transaction building | `src/services/wallet/sendTransaction.test.ts` | Stubbed Electrum, nothing broadcast |
| Transaction classification | `src/services/wallet/transactionClassification.test.ts` | Send vs receive, amounts, counterparties |
| ECIES messaging | `src/services/wallet/messaging.test.ts` | Round trip, confidentiality, tamper detection |
| Secret export paths | `src/services/wallet/exports.test.ts` | Private key, mnemonic, descriptor |
| Watch addresses | `src/services/wallet/WatchAddressService.test.ts` | Per-wallet isolation |
| Storage layer | `src/services/core/StorageService.test.ts` | Wallets, preferences, history, address book |
| Backup and restore | `src/services/core/BackupService.test.ts` | Including QR chunking |
| Lock state and lockout policy | `src/services/core/SecurityService.test.ts` | |
| Script hashes, offline behaviour | `src/services/core/ElectrumService.test.ts` | |
| Price fetching and alerts | `src/services/data/PriceService.test.ts` | `fetch` stubbed |
| Data wipe | `src/services/DataWipeService.test.ts` | Every store actually cleared |
| Class names, logging | `src/lib/utils.test.ts` | |

### Golden derivation vectors

`derivation.test.ts` pins the addresses derived from the published BIP39 test mnemonic
(`abandon abandon … about`) at specific paths, for both coin types and all three script types.

**These values must not be "fixed" to make a test pass.** A change to any of them means the wallet
now derives different addresses than it used to, which strands funds at the old ones. If one
fails, the derivation code changed — work out why before touching the expectation.

### Deliberately pinned defects

None outstanding. If you ever need to add one — a test that asserts behaviour you know is wrong,
so that fixing it is a conscious act rather than an accident — say so plainly in a comment at the
assertion, and change the test in the same commit as the fix.

Two were pinned this way and have since been fixed; their tests now assert the corrected
behaviour and carry a note about what the regression was:

- `CONSOLIDATE_DUST` swept nothing at the default fee rate, because dust was `value <= 1000`
  while the sweep gate was `value > feeRate * 0.1` — also 1000 at the default fee rate, so the
  two conditions were complementary.
- `validateWalletPassword` returned `true` for any password when no wallet existed.

### Sharp edges pinned by tests

Not defects exactly, but behaviour that surprises:

- `StorageService.getTransactionHistory(address)` only queries the `walletAddress` index while
  that returns something. For a wallet with no rows yet it falls back to matching the
  counterparty (`fromAddress` / `address`) instead, so it can return *another* wallet's
  transactions. `processTransactionHistory` filters the result by `walletAddress` for exactly
  this reason — see the note there before removing the filter.
- `WatchAddressService.getWatchedAddresses` is not a plain getter — it refetches every balance
  from ElectrumX and writes the result back, so `updateWatchAddressBalance` only sticks until the
  next read.
- `StorageService.setMnemonic` and its siblings are no-ops when there is no active wallet, so
  `generateWalletFromMnemonic` can succeed while persisting nothing.
- `StorageService.deleteAddress` returns `true` for IDs that were never present.
- `SecurityService.onLockStateChange` reports the *previous* lock reason on unlock.

## Conventions

- One test file per module, named `<module>.test.ts`, next to the code.
- Test names read as sentences about behaviour: `it('refuses the wrong password and broadcasts nothing')`,
  not `it('test password')`.
- Assert on behaviour, not on how it was implemented. The exception is a golden vector or a pinned
  defect, both of which are labelled as such.
- Anything that reaches the network is stubbed. No test may make a real request; `sendTransaction`
  tests capture the raw transaction hex instead of broadcasting it.

## What is not covered

Known gaps, in rough order of how much they would be worth adding:

- **React components in isolation.** No `@testing-library/react` is installed. The Avian Connect
  dialogs are exercised through Playwright, but `SendForm`, `WalletCreationForm` and the contexts
  have no unit-level coverage.
- **Sending and backup as user journeys.** Onboarding, the landing page, the lock screen, balance
  and empty states have E2E coverage alongside Avian Connect, but sending and backup do not yet;
  the `walletPage` fixture is reusable for more journeys.
- **Browsers other than Chromium.** The Playwright config declares one project; Firefox and
  WebKit would need `playwright install` for each.
- **WebAuthn and biometrics.** `setupBiometricAuth`, `authenticateWithBiometric` and the
  credential storage paths need a virtual authenticator.
- **The Electrum wire protocol.** Only `addressToScriptHash` and the offline guards are covered;
  the WebSocket layer, subscriptions and reconnection are not.
- **Signature validity under Avian consensus.** Transaction tests assert structure — inputs,
  outputs, change, fee, and the `0x41` sighash byte — but not that a signature would be accepted
  by a node. bitcoinjs-lib has no FORKID digest, so this cannot be checked in-process.
- **The reprocessing paths** — `reprocessTransactionHistory`,
  `reprocessTransactionHistoryProgressive` and `cleanupMisclassifiedTransactions`. The
  classification they share is covered; the orchestration around it is not.
- **`sendFromDerivedAddress` and PSBT import/export.**
- **Notification services** under `src/services/notifications/`.

Coverage for the Vitest suite: `pnpm test -- --coverage`. Keep `@vitest/coverage-v8` on the same
major version as `vitest` — a mismatch fails at startup with a confusing missing-export error
rather than a version complaint.
