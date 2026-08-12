# Proposal: scrypt KDF hardening + versioned encryption format

- **Status:** proposed (2026-08-12)
- **Area:** `src/services/wallet/encryption.ts` and its call sites (WalletService, SecurityService, StorageService, BackupService)
- **Risk:** high — touches at-rest encryption of every private key, mnemonic, and the biometric-stored password. Must never lock an existing user out.

## Problem

At-rest encryption derives its key with scrypt using hardcoded work factors:

```ts
// src/services/wallet/encryption.ts
const SCRYPT = { N: 16384, r: 8, p: 1, dkLen: 32 } as const;
```

`N=16384, r=8` needs ~16 MB and derives in well under 100 ms on a normal desktop. That is the low/interactive setting. For a wallet whose ciphertext an attacker can steal (it lives in IndexedDB and in exported backups), it makes offline brute-forcing of weak passwords far cheaper than it should be.

Two things make this more than a one-line change:

1. **The parameters are not stored with the ciphertext.** The blob is `salt(64) ‖ iv(16) ‖ tag(16) ‖ ciphertext`, hex-encoded, and `SCRYPT` is a single constant shared by `secureEncrypt` and `secureDecrypt`. Raising `N` in place makes every existing wallet undecryptable — decryption would derive a different key than the one the data was sealed with.
2. **There are three coexisting formats already.** Current (scrypt + AES-256-GCM, authenticated), legacy (CryptoJS AES-CBC, unauthenticated — see `decryptData`), and now we want a fourth: hardened scrypt. Whatever we add has to slot into `decryptData`'s existing fallback chain without weakening the authentication guarantees.

## Goals

- Tune scrypt so a normal unlock takes **~250–750 ms** on typical desktop and mobile hardware, benchmarked (not guessed) — the memory requirement is expected to be the limiting factor, especially on mobile and under `scrypt-js`.
- **Never break an existing wallet.** Old ciphertext (N=16384 and legacy CryptoJS) must keep decrypting forever.
- **Transparent upgrade.** A wallet sealed with the old factors is re-sealed with the new profile the next time it is unlocked, with no user action.
- No new dependency; keep AES-256-GCM (authenticated) as the cipher.

## Non-goals

- Changing the cipher, the HD derivation, or the signing path.
- Migrating backups in place (a backup is sealed with a password at export time; new exports simply use the new profile — see below).
- Argon2 or a WASM KDF. Worth a look later, but out of scope; this proposal stays on `scrypt-js` to avoid a new binary in the bundle.

## Design

### 1. Self-describing, versioned blob

New ciphertext records the KDF profile it was sealed with, so decryption never has to guess. Sketch:

```
v2.<base64url(json header)>.<base64url(salt ‖ iv ‖ tag ‖ ciphertext)>
```

where the header is `{ "kdf": "scrypt", "N": <n>, "r": <r>, "p": <p>, "dkLen": 32 }` (or a short `profile` id that maps to a table — TBD in "Open questions").

The `v2.` prefix and the `.` separators make the new format **unambiguously distinguishable** from the two existing ones: the current format is pure lowercase hex (even length, `[0-9a-f]` only) and the legacy CryptoJS format is its own base64 blob that does not start with `v2.`. So detection is a cheap string check, not a decrypt-and-see.

### 2. Decrypt dispatch

`decryptData` gains one branch at the front of its existing chain:

1. **`v2.` prefix** → parse header, derive with the header's params, AES-GCM decrypt. Authenticated: wrong password throws.
2. **all-hex** → current v1 path (`N=16384`). Authenticated.
3. **otherwise** → legacy CryptoJS path. **Unauthenticated** — the existing `wasLegacy: true` contract still applies (callers must validate against `isValidWIF` / `bip39.validateMnemonic`).

`secureEncrypt` always writes v2 with the chosen profile. `secureDecrypt` stays as the v1 primitive used internally where the format is known.

### 3. Choosing the parameters (benchmark, don't guess)

scrypt memory ≈ `128 · N · r` bytes:

| N | r | memory | note |
|---|---|--------|------|
| 16384 (2¹⁴) | 8 | 16 MB | today — too weak |
| 65536 (2¹⁶) | 8 | 64 MB | likely candidate |
| 131072 (2¹⁷) | 8 | 128 MB | risks OOM on mobile / scrypt-js |

Plan: add a small benchmark harness (dev-only script) that times derivation for a few `(N, r)` pairs and pick the highest that stays under ~750 ms **and** within a safe mobile memory budget on real devices (desktop Chrome, a mid-range Android, iOS Safari). The chosen profile is recorded as a constant `SCRYPT_V2` and written into every new blob's header, so a *future* bump is just another profile — the format won't need to change again.

### 4. Transparent migration

There is already a re-encrypt-on-unlock path for the legacy→modern upgrade (e.g. `SecurityService` ~L796: after `decryptData` returns `wasLegacy`, it calls `secureEncrypt` and persists). Extend the same idea:

- `decryptData` also reports the format it read (e.g. `format: 'v2' | 'v1' | 'legacy'`).
- On a successful unlock, if the stored blob is `v1` **or** `legacy`, re-`secureEncrypt` (now v2) and persist — for the wallet's `privateKey`, its `mnemonic`, and the biometric-stored password (`StorageService` ~L2054).
- Idempotent: a `v2` blob is left alone.

Backups: `BackupService.exportBackup` uses `secureEncrypt`, so new exports are v2 automatically; `parseBackupFile` uses `decryptData`, so it still imports v1 and legacy backups. No in-place backup migration needed.

## Testing

- **Golden vectors:** keep the existing v1 and legacy decrypt vectors (they prove backward compatibility) and add v2 encrypt/decrypt vectors. The unit suite pins fixed ciphertext — the v1/legacy vectors must continue to pass unchanged.
- **Round-trip + migration tests:** seal with v1 → `decryptData` reports `v1` → re-seal → now `v2` and still decrypts to the same plaintext.
- **Benchmark harness:** dev-only, not in CI (timing is machine-dependent), but recorded results justify the chosen profile in the PR.
- E2E is unaffected (it drives the UI, not the KDF), though create/unlock will be measurably slower — the fixtures already allow generous timeouts for scrypt.

## Risks

- **Mobile memory ceiling.** The main risk. `scrypt-js` allocates the full `128·N·r` buffer in JS; too large and low-end phones OOM or jank. Mitigated by benchmarking and picking a conservative profile; `p` stays 1.
- **Unlock latency.** 250–750 ms is intentional and applies to every unlock and every sign that needs the key. Acceptable for a wallet; the UI already shows a spinner.
- **Partial migration.** A wallet re-encrypts only when unlocked; a wallet that is never opened stays v1 (still fully decryptable). That is fine — no data is stranded.
- **The biometric password blob** must be migrated too, or biometric unlock keeps a v1 blob around indefinitely. Included above.

## Rollout

1. Land the versioned format + dispatch + v1/legacy back-compat (no behaviour change yet — new writes are v2, old reads still work).
2. Benchmark and set `SCRYPT_V2`.
3. Turn on re-encrypt-on-unlock for v1/legacy blobs.
4. Ship; wallets upgrade themselves as people open them.

## Open questions

1. **Header: explicit params vs. profile id.** Storing `{N,r,p}` is self-contained and future-proof; a `profile` id is smaller but needs a lookup table shipped with the app. Lean explicit params.
2. **Encoding.** `v2.<b64url>.<b64url>` vs. a binary header with a magic byte then hex. The string form is easy to eyeball and unambiguous; the binary form is more compact. Lean the string form.
3. **Target profile.** Pending the benchmark, but `N=65536, r=8` (64 MB) is the leading candidate for a desktop+mobile PWA.
4. **Should exported backups force v2 immediately, or offer the old profile for interop with older app versions?** Lean force-v2 (a backup is only ever restored by this app, which will understand all formats).
