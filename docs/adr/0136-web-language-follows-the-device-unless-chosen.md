# ADR-0136: The web app's language follows the device unless one is chosen

> Status: Accepted · Decided: 2026-09-29 · Implemented: `feat/settings-device-language-and-cache-clear`
> · Scope: `apps/web/src/i18n/**` · `apps/web/src/app/features/mypage/{components/LanguageSelectSheet.tsx,hooks/useLanguagePreference.ts}`
> · `libs/config/src/registry/ui.ts` (`ui.language`)
> · Builds on [ADR-0079](./0079-config-registry-and-lane-resolver.md) (the registry, its lanes and `persist`)
> · The module doc is [state/stores.md](../../apps/web/docs/state/stores.md#the-language-choice--uilanguage)

## Context

apps/web picked its language with i18next-browser-languagedetector. The detector reads its own
localStorage key (`@<project>_<env>.i18nextLng`) first and writes back whatever language is in
effect — on first launch the detected one, afterwards every `changeLanguage` the Settings sheet made.
So the device language was consulted once, on the first launch, and never again.

On iOS that one reading was wrong. Inside WKWebView `navigator.language` is the app bundle's
localization, not the device's, and the bundle declares English only, so a Korean phone reads
`en-US`. Every iOS install opened in English and stayed there: the detector had stored `en`, and a
stored value wins. The native shell already knows the real device locale — it reads it with
react-native-localize and injects it as `CHATIC_APP_CURRENT_LANGUAGE` before the page loads — but the
detector never looked at it.

`ui.language` had been declared in the registry (`string`, default `ko`, `persist: 'shell'`) with no
consumer.

## Decision

1. **The choice and the language in effect are separate.** The choice is `ui.language` —
   `system` · `ko` · `en`, default `system` — written by the Settings sheet. The language in effect is
   derived from it on every boot and whenever it changes.
2. **`system` is resolved on every boot**, from the device languages in order: the shell's
   `CHATIC_APP_CURRENT_LANGUAGE` first, then `navigator.languages`, then `navigator.language`; the first
   one with a bundle wins (`ko-KR` counts as `ko`), and nothing supported means `en`. The shell comes
   first because of the iOS WebView above.
3. **The detector is retired from apps/web.** i18n is initialised with an explicit `lng`. The
   `i18nextLng` key is still written with the language in effect, because lemon-web-core's
   `x-lemon-language` header is pointed at that name — nothing reads it back as a choice.
4. **`ui.language` is `persist: 'local'`, not `'shell'`** — unlike the other user preferences the shell
   mirrors. The i18n module picks the boot language while it is being imported, which is before
   `main.tsx` runs `config.init()`, so it cannot ask the resolver and reads the persisted value straight
   out of localStorage. A local key is one place to look; a shell value would sit in the boot envelope
   as well. Nothing native reads the choice: the shell derives its own language from the device.
5. **Every existing install starts on `system`.** The detector's stored value is not migrated.

## Alternatives

**Keep the detector and change its lookup order** (`navigator` before `localStorage`). The smallest
diff. Rejected: the order is exactly what made a manual choice survive a reload, so reordering it
either keeps the pinned-forever bug or drops every choice on the next boot, and it still never reads
the shell's value — iOS would keep answering `en-US`.

**`persist: 'shell'`, read from the boot envelope and localStorage at import time.** Consistent with
`ui.theme`. Rejected: the early read would have to reimplement the resolver's lane precedence for one
key, and it buys durability against a WebView storage wipe that the session itself survives only
because it lives in the same localStorage. A lost choice falls back to `system`, which is the default
anyway.

**Migrate the detector's stored value into `ui.language`.** Keeps every existing manual choice.
Rejected, because a detected value and a chosen one cannot be told apart. On iOS the stored `en` is
the bug itself for almost everyone; carrying it over would carry the bug over. A migration limited to
values that differ from the device language would still pin the iOS users this exists to fix.

## Consequences

- iOS installs open in the device language from the next launch, and changing the device language
  takes effect on the next launch without touching Settings.
- **Someone who had picked a language different from their device's loses that pick once.** On
  Android and in a browser the old sheet's choice was stored in the same key as the detector's guess,
  and it is dropped with it. One tap in Settings restores it, and from then on it is kept.
- The language is resolved once per boot. A device language changed while the app stays open is
  picked up on the next launch, not live.
- On iOS only the device's first locale reaches the web (`languageCode` of `getLocales()[0]`). A device
  whose preferred list is `[ja, ko]` resolves past `ja` to the WebView's English rather than Korean.
  Injecting the whole list is a shell change, left for later.
- `x-lemon-language` is still pointed at the `i18nextLng` name, but lemon-web-core reads it under its
  own prefix (`@<project>.i18nextLng`, in its own storage), which only matches this key in a native
  local build. The header was not being sent in deployed builds before this decision and still is
  not; fixing that is a separate change.
- apps/landing keeps the detector; this decision is about apps/web.
