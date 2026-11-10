# ADR-0296: An app's storage media are chosen in one place, and features reach web storage only through them

> Status: Accepted · Decided: 2026-11-09 · Implemented: `feat/general-storage-ports` (apps/web, libs), `feat/desktop-web-storage-ports` (apps/desktop-web, `libs/theme`)
> · Scope: `libs/app-runtime` (`storage/` — `resolveStorageMedia`, the runtime's `device`/`tab` media;
> `initAppRuntime({ storage, signedOutKeyPrefixes })`), `libs/storage` (`TolerantMedium`, `SwitchableMedium`), `libs/auth`
> (`signedOutAppKeys`), `libs/config` (`ui.phoneCountry`), `libs/shared` (phone country), `apps/web`
> (`app/storage/`, entry point, the features that kept state in web storage), `apps/desktop-web` (the same,
> with its zustand stores), `libs/theme` (`ThemeProvider`'s `storage`), the root ESLint config
> · The behaviour is documented in [libs/storage](../../libs/storage/README.md),
> [libs/app-runtime](../../libs/app-runtime/README.md), [apps/web](../../apps/web/README.md) and
> [apps/desktop-web docs/storage](../../apps/desktop-web/docs/storage/README.md)

## Context

ADR-0293 split storage by medium (`@chatic/storage`) and moved the session onto two ports whose media
the entry point chooses. Everything else an app keeps stayed where it was: about twenty places in
`apps/web` and the libs called `localStorage` or `sessionStorage` themselves — composer drafts and
input locks behind a hand-written guard, the recent emoji and push marks through zustand `persist`
with no `storage` (which falls back to `localStorage` silently), the sent-invite log, the browser log
queue and its heartbeats, the telemetry policy, the crash sentinel, the pending invite channel, the
language and translation cache, the theme's shared key, the phone fields' last country, the debug
unlock, the sync cursor watermark and a tab's invited clouds. Each chose its own storage and its own
failure handling, and none of it could be found except by searching for the two globals — a search
that had already missed the zustand defaults once.

The media themselves were also built in two places per app: the entry point's own conditionals
(`isNative() ? local : session`, the vault flag, the late-vault mark), and `libs/transport`, which
built lemon-web-core's memory medium where no entry point could see it.

Finally, the logout sweep in `libs/auth` named the log pipeline's and the telemetry policy's keys
itself — a session package holding another domain's key names.

## Decision

**One function chooses the media an app's session, runtime and features keep state in, and nothing
else in apps/web or the libs names a web storage.** apps/web uses it now; desktop-web still builds its
media in its entry point and moves next.

1. **`resolveStorageMedia()`** (`libs/app-runtime`, `boot` group) reads the environment once — in a
   shell or not, whether the shell listed `nativeSecure`, the tab's late-vault mark — and returns the
   session's `secret`/`plain`, the vault when there is one, a `device` medium (`localStorage`, in every
   environment), a `tab` medium (`sessionStorage`) and the two raw web media. It is the storage
   counterpart of `resolveCacheBackend`. apps/web's entry point calls it once and hands the result out.
2. **Features take `device` or `tab`, never a global.** apps/web exposes them from `app/storage/` as
   stable delegates, so stores created at import time still write where the entry point said. The
   runtime keeps its own two (`initAppRuntime({ storage: { device, tab } })`) for the cursor watermark
   and a tab's invited clouds. The features' media are `TolerantMedium`: a full or blocked storage
   costs the value, not the screen. The runtime's `tab` is the raw `webSession`, because the invited
   clouds are a cache whose engine must hear that a write did not land; and the watermark consumes its
   pending request only once the new value reads back, so a full storage retries on the next boot.
3. **The root ESLint config enforces it** for apps/web and the libs: `localStorage`/`sessionStorage`
   (bare, on `window` or `globalThis`) and a zustand `persist` without a `storage` are errors. Tests,
   `libs/storage`, the mini-app SDK and `libs/theme` are left out — the last because the apps it serves
   (desktop-web, admin-v2, landing) have not moved yet.
4. **Key names do not change.** A value whose medium stays the same is wrapped, not migrated, so
   nothing already stored is lost and the end-to-end fixtures that seed those keys still hold.
5. **Settings that lived outside the registry move into it where they are settings.** The phone
   fields' last country becomes `ui.phoneCountry` (`persist: 'local'`), carried over once from its old
   key by `migrateLegacyPhoneCountry` after `config.init()`. The language was already `ui.language`; the
   theme was already `ui.theme`, and its cross-app `vite-ui-theme` copy stays, written through `device`,
   because five apps' pre-paint scripts read it. The debug unlock record stays a `tab` value rather than
   a setting: it has to work before `config.init()` and is the only way in on a production build.
6. **A domain declares the keys a sign-out takes.** apps/web's log pipeline and telemetry policy export
   their key prefixes, the entry point passes them as `initAppRuntime({ signedOutKeyPrefixes })`, and
   `libs/auth` only runs the sweep — at sign-out and on the `?logout=1` boot, as before.

Out of scope here, and next: apps/desktop-web onto the same media and lint rule; a native key-value
medium in place of the shell's two existing preference channels; lemon-web-core replaced by an
in-house request signer, which removes its memory medium altogether.

## Alternatives

- **A storage lib per kind of value** (`config-store`, `log-store`, …). Each would carry its domain's
  meaning — a queue, an expiry — back into the storage layer, and the media would be implemented once
  per lib. The media stay meaning-blind; the queue stays in the log domain.
- **A port per feature.** Every draft store, log queue and sentinel would declare its own port and the
  entry point would wire twenty of them. Two media — outlives the tab, or does not — cover every case
  found, and the vocabulary stays small enough for one entry point to read.
- **Make `WebMedium` itself tolerant.** The session must hear that a write failed (the vault migration
  and the logout depend on it); only convenience state should swallow failures, so the tolerance is a
  wrapper chosen per medium.
- **Move the debug unlock and the language into config keys as well.** The language already is one; the
  unlock record is security-relevant and has to be readable before `config.init()`, which a setting is
  not.
- **Keep the sign-out key list in `libs/auth`.** It worked, but every new domain that writes an
  account's data would have to edit the session package; the list now lives with the code that writes
  the keys.

## Consequences

- One place answers "where does this app keep state, in this environment" — the resolver's table —
  and a reader no longer has to search for globals to find a value's storage. A few constructions stay
  outside it on purpose: the debug storage screen walks the two web storages whole, each holder serves
  the same web storages before its entry point configures it, and lemon-web-core's memory medium is
  still built in `libs/transport` until lemon-web-core itself goes (it went with ADR-0298).
- Adding state is choosing `device` or `tab`; naming a web storage directly fails lint.
- A full or blocked web storage no longer throws out of the sent-invite log write, which it did before.
- `libs/shared` reads the phone country from `@chatic/config`; before `config.init()` it falls back to the
  locale, as it did when storage was unavailable. Config reads its local lane into memory once at init,
  so a country picked in another tab now shows only after a reload — before, every read went to
  `localStorage`. The carry-over drops the old key only once the setting's stored copy reads back.
- ADR-0293's note that a key a sign-out should take "must be named in `signedOutAppKeys.util.ts`" no
  longer holds: it is declared by its domain and passed at boot. An app that declares none has nothing
  swept, which is what desktop-web and admin-v2 need — they write none of those keys.
- desktop-web still builds its media in its entry point and is outside the lint rule until it moves.
