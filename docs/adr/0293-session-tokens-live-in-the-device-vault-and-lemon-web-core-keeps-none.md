# ADR-0293: Session tokens live in the device vault, and lemon-web-core keeps none

> Status: Accepted, superseded in part by [ADR-0296](./0296-an-apps-storage-media-are-chosen-in-one-place-and-features-reach-web-storage-only-through-them.md) (which code names the keys a sign-out takes) · Decided: 2026-11-06 · Implemented: `feat/client-storage`
> · Scope: `libs/storage` (new), `libs/session` (ports), `libs/auth` (`session/storage/`, `relaySession`,
> `relayCredentialProbe`), `libs/transport` (lemon in memory), `libs/bridge-messages` (`StorageGet` ·
> `StorageSave` · `StorageClear`, bridge 2.21.0), `apps/mobile` (`services/secureStorage`), `apps/desktop`
> (`main/secureStorage`), the entry points of `apps/web` · `apps/desktop-web` · `apps/admin`
> · The behaviour is documented in [libs/auth docs/session](../../libs/auth/docs/session/README.md) and
> [libs/storage](../../libs/storage/README.md)

## Context

Inside the phone app and the desktop app, the web kept the session's credentials — the relay token,
the cloud delegation and cloud tokens, and the per-cloud token cache — in the origin's `localStorage`,
in plain text, next to everything else. lemon-web-core kept a second copy of the relay credential
there too, with an expiry clock of its own that disagreed with the credential's. Both shells have an
OS-backed vault available: the iOS Keychain and Android Keystore, and Electron `safeStorage` on the
desktop.

The storage code itself was one swappable adapter in `@chatic/shared`, chosen per app with
`isNative() ? localStorage : sessionStorage`, plus a handful of places that reached past the session
to web storage directly: the logout sweep (the whole `@` namespace), the paired-cloud list, the device
id, the debug storage screen and lemon's own store.

## Decision

**In a shell that keeps a vault, the four session tokens live only in the vault; the web reads them
from a copy it loads into memory at boot and writes them back through the bridge. lemon-web-core, in
every environment, keeps no credentials of its own between pages.** The two go together because the
vault would otherwise hold one copy of the relay credential while lemon kept a second, in plain text,
in the same `localStorage` the vault replaces.

- **One copy, no dual write.** The web copy in `localStorage` is moved into the vault at boot and
  deleted once the shell confirms the write — not kept alongside.
- **Storage is split by medium** (laid down in the commit before this one, with no change of
  behaviour, so this decision only changes which medium backs a port). `@chatic/storage` holds media — `webLocal`, `webSession`, `memory`,
  `nativeSecure` — behind one synchronous `KeyValueStore`. The session declares two ports, `secret` (the
  four tokens) and `plain` (everything else it keeps), and each app's entry point decides which medium
  backs each port: the vault and `localStorage` in a shell that keeps one, `localStorage` for both in a
  phone shell from before the vault, `sessionStorage` for both in a browser and the admin console.
- **The web reads the vault once, at boot.** The shell reads its vault when it starts, before the page;
  the web asks for the values with `StorageGet` before the runtime boots, and every read after that is
  synchronous. Writes of one event-loop turn travel as one `StorageSave`, confirmed only once they are
  in the vault.
- **The shell says it keeps a vault**, in `window.CHATIC_APP_STORAGE_MEDIA`. The web decides from that
  alone — `isNative()` is true in every shell, including ones from before the vault.
- **A vault that cannot be used this run is not empty.** Locked before the first unlock, a write that
  failed, or no answer to the read in five seconds (counted while the page is visible): the run keeps the session in the tab's `sessionStorage`, never
  in `localStorage`, and the web copy (if any) is kept for the next run. The one exception is a vault
  the shell cannot decrypt — a device key that was invalidated, data restored from another device —
  which it empties; the person signs in again.
- **lemon-web-core is a signer with no storage.** Its credentials live in memory in every environment,
  rebuilt from the relay token at boot. "Is there a session" is a stored relay token; "has the
  credential expired" is the relay credential's own clock.
- **Logout waits for the vault.** It clears the session, lemon and the app keys a sign-out takes by
  name, empties the vault and waits for the shell to confirm before it leaves the page; when no
  confirmation comes, a marker makes the next boot empty the vault before reading it.
- **The phone app forgets the vault on reinstall** (an install marker the vault is checked against);
  the desktop app does not — macOS has no install hook, and the encrypted file survives an uninstall
  the way the rest of `userData` already did.

## Alternatives

- **Keep the tokens in `localStorage`, encrypted by the web.** Rejected: the key would sit next to the
  ciphertext, in the same page.
- **Write both the vault and `localStorage` for a while (dual write).** Rejected: the plain-text copy is
  what the change removes, and two copies drift — which is what lemon's second copy already did.
- **Read through the bridge on every access.** Rejected: the session is read on every request and
  every render, synchronously, and an asynchronous read would change every caller.
- **Treat an unreadable vault as empty.** Rejected: a locked phone would sign the person out and the
  migration would delete the web copy as already moved.
- **A web build that can move the tokens back out of the vault.** Rejected: rolling back means
  shipping a web build anyway, and a shell from before the vault already runs on `localStorage` with
  no help — only a shell that keeps a vault would need it, and for that shell the vault is the point.
- **Detect a reinstall on the desktop through the installer.** Rejected for now: macOS installs by
  dragging the app, and the Windows installer also runs for every self-update, which would sign
  everyone out on update.

## Consequences

- A shell from before the vault keeps working as before; its tokens move the first time a shell that
  keeps a vault starts.
- The debug storage screen's wipe empties the vault too, so a wipe still leaves the next load signed
  out.
- Writes are confirmed asynchronously: a crash between a token refresh and its `StorageSave` loses that
  refresh, and the session renews it again on the next start, as it does for any stale credential.
- The logout sweep no longer clears the whole `@` namespace; a key someone adds under `@` that a
  sign-out should take must be named in `signedOutAppKeys.util.ts`.
- The bridge is 2.21.0, and `@chatic/chatic-apps-sdk` follows it.
