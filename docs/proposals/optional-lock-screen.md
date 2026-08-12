# Proposal: optional lock screen, load-then-authenticate

**Status:** implemented (2026-08-12)
**Scope:** its own PR, after the reconnect/balance fixes land

> **Implementation note.** Built as specified, with one deliberate simplification: rather than an
> overlay over always-mounted children, the wall renders *in place of* the wallet subtree while the
> `SecurityContext.Provider` stays mounted. The user-facing behaviour is identical (default no-wall
> loads read-only; opt-in wall shows on start), `requireAuth` works in both modes and still fails
> closed, and it sidesteps a z-index/stacking fight the sibling-overlay hit. Open questions 1
> (session-password timeout) and 2 (biometric-only unlock) remain follow-ups; a lock now clears the
> in-memory password (the credential half), but there is no standalone key-timeout without the wall.

## Summary

Today FlightDeck locks the whole UI behind a password wall on every start. This proposes
loading the wallet's **read-only** state (balance, address, receive QR, history) without a
password, and demanding authentication only for actions that actually need the key — send,
export, sign, connect-approval. The full lock screen stays available as an opt-in for people who
want a device-access guard, but it is no longer the default.

This is the model Radiant and several other wallets use. It is safe here specifically because
**FlightDeck already encrypts keys at rest** (scrypt + AES-GCM) — the lock screen gates the UI,
not the secrets, and everything shown read-only is public blockchain data anyone with the address
can already see.

## Why this is an architectural change, not a flag

`isLocked` currently conflates two orthogonal ideas:

1. **UI visibility** — is the whole app hidden behind a wall?
2. **Credential availability** — is the decryption password held in memory for silent re-auth?

Two facts from the current code make the conflation concrete:

- [`SecurityContext.tsx:316`](../../src/contexts/SecurityContext.tsx#L316) — when `isLocked`,
  `SecurityProvider` returns `<SecurityLockScreen>` **instead of** `{children}`. Since
  `SecurityProvider` wraps `WalletProvider`
  ([`layout.tsx:116`](../../src/app/layout.tsx#L116)), the entire wallet subtree does not mount
  while locked. There is no "read-only load" to show — the wallet context does not exist.
- [`SecurityContext.tsx:235`](../../src/contexts/SecurityContext.tsx#L235) — `requireAuth`
  early-returns `{ success: false }` when `isLocked`. Sensitive actions cannot authenticate while
  locked, which is fine today because they are unreachable, but blocks the proposed model.

So the work is to **split the two concepts**, not to add a bypass.

## Target model

Introduce two independent pieces of state:

| Concept | Meaning | Replaces |
| ------- | ------- | -------- |
| `screenLocked` | The opt-in full-screen wall is showing | today's `isLocked` for the UI gate |
| `keyUnlocked` | The password is in memory for silent re-auth this session | today's `storedWalletPassword != null` |

- **Default (screen lock off):** `screenLocked` starts `false`. `WalletProvider` mounts and loads
  read-only immediately. `keyUnlocked` starts `false` — the first send/export/sign prompts, and
  from then on `requireAuth(msg, autoLogin: true)` reuses the in-memory password for the session.
- **Screen lock on (opt-in, or after an auto-lock timeout):** `screenLocked` starts `true` and
  the wall shows exactly as today. Unlocking sets both `screenLocked = false` and
  `keyUnlocked = true`.

Crucially, `requireAuth` stops gating on the UI wall and gates on `keyUnlocked` instead — so it
works whether or not the wall was ever shown.

## Concrete changes

### 1. Restructure the provider tree — `layout.tsx`, `SecurityContext.tsx`

`WalletProvider` must mount regardless of lock state. Move the lock-screen render out of the
provider's early-return so it becomes an **overlay** over the mounted tree rather than a
replacement for it:

```tsx
return (
  <SecurityContext.Provider value={…}>
    {children}
    {screenLocked && <SecurityLockScreen onUnlock={handleUnlock} lockReason={lockReason} />}
    <AuthenticationDialog … />
  </SecurityContext.Provider>
);
```

`SecurityProvider` already tolerates `useWallet()` being absent (try/catch at
[`SecurityContext.tsx:42`](../../src/contexts/SecurityContext.tsx#L42)), so the two providers can
also be reordered (`WalletProvider` outer) if that proves cleaner — to be decided during
implementation, but the overlay approach needs no reorder.

### 2. Split the state — `SecurityContext.tsx`

- Rename the UI flag to `screenLocked`; derive `keyUnlocked` from `storedWalletPassword`.
- `requireAuth`: replace the `if (isLocked) return {success:false}` guard. When the key is not in
  memory it should **prompt**, not fail — which is already most of what the function does; only
  the early return is removed.
- Keep `manualLock()` / the auto-lock timeout wired to `screenLocked` so the timeout still raises
  the wall for users who enabled it.

### 3. Settings — `SecurityService` + security settings page

Add `autoLock.screenLockEnabled` (default `false`). The existing `autoLock.enabled` /
`requirePasswordAfterTimeout` already exist; this adds the "show the wall at all" switch. The
security-settings page gets one toggle: **"Require password to open the wallet."**

### 4. Read-only safety — already handled

The balance-status work already merged means a read-only load on a flaky connection shows
"balance unavailable" rather than a misleading `0`. That is exactly the state this model spends
most of its time in, so no extra work is needed there — but it is a hard dependency, which is why
this proposal is sequenced after it.

## Security analysis

**What we still protect.** Keys and mnemonics remain encrypted at rest and are never held
decrypted; only the user's password sits in memory after the first authenticated action, exactly
as today. Every spend, export, sign and connect-approval still requires `requireAuth`. The
threat model for *key theft* is unchanged.

**What we give up by default.** Device-access privacy for read-only data: someone who picks up an
unlocked device sees the balance, address and history without a password. This is already public,
address-keyed blockchain data — but "visible on my screen" is a real privacy step down from
today, so the wall stays one toggle away for anyone who wants it.

**What we must not regress.**

- `requireAuth` must never silently succeed without a password in memory. The
  `validateWalletPassword`-fails-open bug we already fixed is the cautionary tale here.
- Auto-lock-on-timeout must still work for users who enable the wall.
- The stored-password lifetime should get a hard session cap (see open questions).

## Testing

- **Unit (SecurityService/context):** `requireAuth` prompts when `keyUnlocked` is false and reuses
  the password when true, independent of `screenLocked`; the timeout path still raises the wall
  when enabled.
- **E2E, both modes** — the `walletPage` fixture makes this cheap:
  - default: fresh load shows balance without a password; first `send`/export prompts.
  - screen-lock on: the wall shows on start, unlock reveals the wallet.
  - the toggle flips behaviour on next load.
- **Regression:** a locked wallet still cannot sign; a wrong password at any prompt still fails
  closed.

## Open questions

1. **Session-password lifetime.** Today `storedWalletPassword` lives for the whole session with
   no cap. Under a load-then-prompt model it is the main secret in memory — a timeout that clears
   it (re-prompting on the next sensitive action) is worth adding, distinct from the UI wall.
2. **Biometric-only unlock.** Should enabling the wall + biometrics allow opening read-only with a
   fingerprint but no password held? Probably out of scope for v1.
3. **Default for existing users.** New installs default to no wall. Existing users who have been
   living with the wall should probably keep it on migration and be told the toggle exists, rather
   than silently dropped to no-wall.

## Rollout

1. Land reconnect + balance-status fixes (done — hard dependency).
2. This PR: state split, provider restructure, settings toggle, tests. Default off for new
   installs; on for existing installs on migration.
3. Follow-up (optional): session-password timeout from open question 1.
