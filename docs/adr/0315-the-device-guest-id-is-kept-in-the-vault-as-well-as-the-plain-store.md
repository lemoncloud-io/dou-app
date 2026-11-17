# ADR-0315: The device guest's id is kept in the vault as well as the plain store

> Status: Accepted · Decided: 2026-11-15 · Implemented: `fix/delegator-id-in-vault`
> · Scope: `libs/session/src/store/identityStore.ts` (both copies, secret first);
> `libs/session/src/store/ports/sessionKeys.ts` (`DELEGATOR_ID_KEY`, kept off the secret list);
> `libs/auth/src/session/storage/secretStorageMigration.ts` (`copyDelegatorId`, rows decided by the
> tokens, the tab sweep); `libs/auth/src/session/relaySession.ts` (the logout's tab sweep);
> `libs/storage/src/stores/nativeSecure/` (`NativeStore.offer`)
> · The behaviour is documented in [libs/session README](../../libs/session/README.md),
> [libs/auth docs/session](../../libs/auth/docs/session/README.md),
> [libs/storage README](../../libs/storage/README.md) and
> [apps/mobile docs/runtime](../../apps/mobile/docs/runtime/README.md)
> · Amends: [ADR-0309](./0309-the-phone-shell-may-own-the-session-settled-per-launch.md) — one plain
> session value now reaches the app's runtime; [ADR-0293](./0293-session-tokens-live-in-the-device-vault-and-lemon-web-core-keeps-none.md)
> — the vault holds one value that is not a token, written in both ports
> · Amended by: [ADR-0331](./0331-a-web-copy-no-page-moved-wins-over-the-vault.md) decisions 2 and 7 — the boot writes the plain id over the
> vault's when a web copy replaces the vault's tokens

## Context

`chatic-delegator-id` is the guest the relay registers for this device, the user an invited cloud is
accepted under. The server derives that guest from the device id (`register-device` finds the account
by its device alias), so a phone has one, whichever side holds the session. Each invited-cloud row in
the local cache records it in `acceptedBy`. The cloud list shows a row only to a session that holds
one of the ids recorded there. Accepting a new invite needs the id too.

The id is written at one moment, a guest login, and cleared at one, a relay logout. It lived in the
session's plain port. In a shell that port is the page's `localStorage`. When the app's runtime holds
the session (ADR-0309), the plain port is a file of the runtime's own, which starts empty. Only the
secret port, the device vault, is shared: the same item under the same keys. An install signed in to an
account never logs in as a guest again, so on a launch the runtime owns:

- its `delegatorId` stays null;
- every invited cloud the account accepted (recorded under the guest id, not the account's relay uid)
  drops out of the cloud list, though the rows are still in the app's database;
- a new invite fails with `No delegatorId for invite flow`.

The same hole exists today without the runtime: when the OS clears a WebView's `localStorage`, the
tokens survive in the vault, the person stays signed in, and the id is gone.

The id is a local authority: no API lists it back, and a wrong one is worse than none. Delegating
into a cloud under a user the server never granted makes it mint an empty user there. Every room
then answers 403, which cannot be undone from the device. A missing id costs a hidden list and a
refused invite, both recoverable.

## Decision

1. **The id is kept in both ports.** `identityStore.setDelegatorId` writes and clears the secret copy
   and the plain copy together. `getDelegatorId` reads the secret copy first and falls back to the
   plain one. No other session key changes port.
2. **The boot copies it into the vault, and never deletes it.** `secretStorageMigration.prepare`, run
   by every entry that keeps a vault, copies the plain copy into a vault that lacks the id in three
   rows: `values`; `empty` with no web copy; `empty` with a web copy, once the move is confirmed. It
   never overwrites an id the vault holds, and never runs in the logout row, the unavailable rows, or
   after a refused move. The next boot tries again, and the reader falls back to the plain copy meanwhile.
3. **The copy cannot cost the run its vault, or hold the boot.** It is sent with `NativeStore.offer`, a
   write that leaves the store as it was when the shell refuses it, where a refused `set` switches the
   whole run, tokens included, to the tab. The boot does not wait for it. The offer is queued in order
   with the writes around it, so a logout made meanwhile still wins.
4. **The vault's rows are decided by the tokens alone.** A vault holding only the id is not a
   signed-in one, so a web copy of the tokens is still moved into it rather than deleted.
5. **The tab sweeps take the id too.** A run whose vault is unavailable writes it to the tab through the
   store's fallback; the boot that finds the vault again and the logout remove it with the tokens. In a
   shell with a vault the tab is never the plain store.
6. **The id stays off `SESSION_KEYS.secret`.** Every key on that list has its web copy deleted once
   the vault holds values, and for this key the web copy is the only one an existing install has.
   The secret copy is declared as `DELEGATOR_ID_KEY` beside the list instead.
7. **When the copies differ, the vault's wins and a warning is logged.** They only ever hold this
   device's guest. They can differ when the other side ended a session and cleared only its own
   copies, and the guest login that follows writes the same id back.

ADR-0293's "one copy, no dual write" was about credentials: a second copy of a token in plain text is a
second way to sign as the user. The guest id signs nothing, and its second copy is the point.

## Alternatives

- **Add the key to `SESSION_KEYS.secret` and let the existing migration move it.** That is a single
  line, and on every install with a session it would lose the id: the vault already holds the tokens,
  so the migration takes the `values` row, "the vault is the truth; delete the web copy", and deletes
  the only copy without writing it. Rejected.
- **Move the id (copy, confirm, then delete the plain copy), as the tokens moved.** It is the same
  resumable shape, but a web rollback reads only the plain port and would come back with no id. So
  would a run whose vault is locked before the first unlock. Keeping the copy costs one duplicated
  string. Rejected.
- **Sync it in the background at the guest login only.** That is the moment the id is written, but the
  installs that need it are signed in to an account and never reach that moment again. The boot copy is
  still needed, and with it the login-time sync adds nothing the dual write does not.
- **Re-derive it by calling `register-device` from the runtime.** It returns the right id, but it issues
  a guest token and asks for the self chat on a device that is signed in to an account. That is a side
  effect for a value the device already holds. Kept as a way to verify the id later, not to obtain it.
- **Drop the `acceptedBy` filter on the phone, since a phone has one guest.** That holds while the
  device id never changes. A device that had two guests (an older build's device id, a browser-style
  id) would show one guest's clouds to the other, which is the failure the filter was added for
  (ADR-0156). Rejected.

## Consequences

- An install that has had one launch of a page build with this change holds the id in the vault, and
  the app's runtime reads it there. An install switched to the runtime before such a launch reads none
  until its next guest login. The switch is development-only today, and it must close that gap before
  it becomes a default.
- A WebView whose `localStorage` the OS cleared keeps the id through the vault copy.
- The vault takes one extra write per install, and the boot does not wait for it. A refused or
  unanswered copy leaves the run on the vault. The phone and desktop shells stop accepting writes for
  the process after a keychain failure, so the run's next token write is refused then; that token
  write would have met the same keychain failure on its own.
- The desktop shell runs the same boot step, so its `safeStorage` file holds the id as well.
- After a relay logout on one side, the other side's plain copy still holds the guest id until that
  side writes. Because the id names the same device guest the next login writes, nothing reads it as
  another user.
