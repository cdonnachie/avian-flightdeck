# Proposal: move the password KDF from scrypt to Argon2id (WASM)

- **Status:** proposed (2026-08-13)
- **Area:** `src/services/wallet/encryption.ts` and its call sites (WalletService, SecurityService, StorageService, BackupService)
- **Builds on:** the versioned encryption format from [scrypt-kdf-hardening.md](scrypt-kdf-hardening.md) — this proposal reuses it rather than inventing a new format.
- **Risk:** high — touches at-rest encryption of every private key, mnemonic, and the biometric-stored password. Must never lock an existing user out.

## Motivation

Two things, one change fixes both:

1. **Argon2id is the current best practice.** It won the Password Hashing Competition and is the KDF OWASP and modern guidance recommend for password hashing/derivation — memory-hard *and* resistant to the side-channel/timing leaks that pure scrypt does not address. It is a strict upgrade over scrypt for sealing secrets an attacker can copy (our ciphertext lives in IndexedDB and in exported backups).
2. **It is faster here, not slower.** Our current scrypt runs on `scrypt-js`, a **pure-JavaScript** implementation. That is why derivation is sluggish in the browser (several × the node figure) and why N had to be dialled back for mobile. A **WASM** Argon2id runs at near-native speed, so we can have a *stronger* KDF that is also *faster* — instead of trading security for speed.

So this supersedes the scrypt N-tuning: rather than pick a weaker scrypt N to survive mobile, we switch to a KDF that is both stronger and quick.

## Goals

- Derive with **Argon2id** for all new ciphertext, benchmarked to ~**250–750 ms** on typical desktop and mobile, within a mobile-safe memory budget.
- **Never break an existing wallet** — scrypt (v1 and v2) and legacy CryptoJS blobs keep decrypting forever.
- **Transparent upgrade** — a wallet sealed with scrypt (or legacy) is re-sealed with Argon2id the next time it is unlocked, no user action.
- Keep the WASM out of the initial bundle (lazy-load; the KDF is only needed on unlock / sign / create / backup).

## Non-goals

- A new blob format. The existing versioned header already carries a `kdf` field, so Argon2id is just a different `kdf` value — no `v3`.
- Changing the cipher (stays AES-256-GCM), HD derivation, or signing.
- Removing scrypt code — it stays as a read path for old blobs (and as a fallback, see open questions).

## Design

### 1. The format already accommodates it

Today `secureEncrypt` writes `v2.<base64 header>.<base64 body>` where the header is:

```json
{ "kdf": "scrypt", "N": 32768, "r": 8, "p": 1, "dkLen": 32 }
```

Argon2id simply writes a different header:

```json
{ "kdf": "argon2id", "m": 65536, "t": 3, "p": 1, "dkLen": 32, "v": 19 }
```

(`m` = memory in KiB, `t` = time/iterations, `p` = parallelism, `v` = Argon2 version 0x13.) The salt lives in the body exactly as now (`salt ‖ iv ‖ tag ‖ ciphertext`, base64). **No format change** — decryption already reads the header to learn how to derive.

### 2. Derivation dispatch

`deriveKey` becomes a small dispatcher on `header.kdf`:

- `argon2id` → call the WASM Argon2id with the header's `m/t/p/dkLen`.
- `scrypt` (or a bare v1 hex blob) → the existing scrypt path with its `N/r/p`.
- legacy CryptoJS → unchanged, unauthenticated, `wasLegacy: true`.

`secureEncrypt` always writes Argon2id. `secureDecrypt` handles argon2id-v2, scrypt-v2, v1-hex and legacy. `decryptData` already returns `{ decrypted, wasLegacy, format }`; add the KDF to `format` (or a `kdf` field) so migration knows what to upgrade.

### 3. Library

Leading candidate: **`hash-wasm`** — a single, well-maintained, dependency-free WASM bundle that includes `argon2id`, works in both the browser and node (so the Vitest suite and the e2e fixtures can use it too), and exposes a simple `argon2id({ password, salt, parallelism, iterations, memorySize, hashLength })`. Alternative: `argon2-browser`. Final choice is an open question below; both are pure-WASM with no native toolchain.

The WASM is **lazy-loaded** (`await import(...)` inside `deriveKey`) so it never enters the initial route bundle — consistent with how `encryption.ts` already avoids pulling in secp256k1.

### 4. Choosing parameters (benchmark, don't guess)

Argon2id memory is `m` KiB. Rough starting point to benchmark: `m = 64 MiB, t = 3, p = 1` (OWASP's baseline is m=19 MiB/t=2; a wallet can afford more). Add a dev harness (like `scripts/bench-scrypt.cjs`) that times a few `(m, t)` pairs in node **and** guidance to measure in the running PWA on a real handset — mobile memory is again the limiting factor. Because the header records the exact params, re-tuning later is a one-line change with no format churn.

### 5. Transparent migration

Reuse the existing re-encrypt-on-unlock path (`SecurityService.unlockWallet`, already upgrading non-v2 blobs after validating the decrypted key is a real WIF). Widen the trigger from "not v2" to "not argon2id": on unlock, if the stored blob's KDF is scrypt or legacy, re-`secureEncrypt` (now Argon2id) the private key and mnemonic and persist. Idempotent for blobs already on Argon2id. A wallet never opened stays on scrypt and still decrypts.

Backups: `exportBackup` uses `secureEncrypt`, so new exports are Argon2id automatically; `parseBackupFile` uses `decryptData`, so it still imports scrypt and legacy backups.

## Testing

- **Golden vectors:** keep the existing scrypt-v1 and legacy decrypt vectors (back-compat) and add an Argon2id encrypt/decrypt round-trip plus a fixed Argon2id vector.
- **Migration test:** seal with scrypt → `decryptData` reports scrypt → unlock re-seals → now Argon2id and still decrypts to the same plaintext.
- **e2e:** reuse the `NEXT_PUBLIC_SCRYPT_N` idea — add an env override for cheap Argon2id params (small `m/t`) in the e2e build so browser derivation stays fast and deterministic. The versioned header keeps low-cost e2e blobs and production blobs mutually decryptable.
- Vitest and the e2e fixtures both run Argon2id in node via the same WASM module.

## Risks

- **WASM availability.** WebAssembly is supported by every browser we target and by node; the PWA already ships as static files. If a hostile environment blocks WASM, derivation fails — see the open question on a scrypt fallback.
- **Bundle size.** The Argon2 WASM is small (tens of KB) and lazy-loaded, so it does not affect first paint.
- **Mobile memory.** Same ceiling concern as scrypt — benchmarked, `p` stays 1, `m` chosen conservatively.
- **Migration safety.** Unchanged from the scrypt migration: validate the decrypted WIF/mnemonic before persisting, or a wallet could be destroyed. The existing guards cover this.

## Rollout

1. Land the library + dispatch + Argon2id write path + scrypt/legacy read paths (new writes are Argon2id, old reads still work). Benchmark and set the production profile.
2. Turn on re-encrypt-on-unlock for scrypt/legacy blobs.
3. Ship; wallets upgrade themselves as people open them. Drop the scrypt N-tuning follow-up — Argon2id replaces that decision.

## Open questions

1. **Library:** `hash-wasm` (leaning) vs `argon2-browser`. hash-wasm is smaller and covers node+browser from one package.
2. **Parameters:** pending the benchmark; `m=64 MiB, t=3, p=1` is the starting candidate, adjusted down if mobile can't take 64 MiB.
3. **Fallback:** if WASM fails to load, do we (a) fall back to scrypt for that derivation, or (b) hard-fail with a clear error? Leaning (b) for new writes (predictable format) but keeping scrypt fully functional as a read path regardless.
4. **Header `v` field:** record the Argon2 version (0x13) for absolute clarity, or rely on the library default? Leaning record it.
