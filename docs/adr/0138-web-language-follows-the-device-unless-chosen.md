# ADR-0138: The app's language follows the device unless one is chosen

> Status: Accepted · Decided: 2026-09-29 · Implemented: `feat/settings-device-language-and-cache-clear`
> · Scope: `apps/web/src/i18n/**` · `apps/web/src/app/features/mypage/{components/LanguageSelectSheet.tsx,hooks/useLanguagePreference.ts}`
> · `libs/config/src/registry/ui.ts` (`ui.language`) · `apps/web/src/app/bridge/languageChoice.ts`
> · `apps/mobile/src/app/{stores/language*.ts,utils/i18n/index.ts,bridge/SharedLanguageBridge.ts}`
> · the shell's `SharedLanguage` module and push services (`NotificationService.swift`, `ChaticFirebaseMessagingService.kt`)
> · Builds on [ADR-0079](./0079-config-registry-and-lane-resolver.md) (the registry, its lanes and `persist`)
> · The module docs are [state/stores.md](../../apps/web/docs/state/stores.md#the-language-choice--uilanguage)
> (web) and [system/language.md](../../apps/mobile/docs/system/language.md) (shell)

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
4. **`ui.language` is stored the way `ui.theme` is.** It is `persist: 'shell'`, written on the shell
   lane (mirrored locally for a browser with no shell), and the choice is also sent to the shell's own
   `languageStore` with `SavePreference('language')`, `system` included — on every change and once per
   native boot. The i18n module picks the boot language while it is being imported, before `main.tsx`
   runs `config.init()`, so it reads the boot envelope and then the local mirror itself, in the
   resolver's order.
5. **The shell follows the choice too.** Its own copy (`t()`: alerts, error screens, Android channel
   names) uses the pinned language, else the device's. The push banners are built by the iOS
   Notification Service Extension and the Android messaging service, which run without the app, so
   the shell copies the choice into App Group defaults / SharedPreferences for them. What the shell
   injects into the web as `CHATIC_APP_CURRENT_LANGUAGE` stays the device's language — that is what
   the web resolves `system` from.
6. **The shell reads the web's config value first.** At boot the shell's `languageStore` takes
   `ui.language` from its config store (the bag the web writes on the shell lane) before its own key.
   The web deploys before the installed app updates: a choice made on an older shell reaches the bag,
   but that shell kept its own copy as a zustand envelope, which the new shell discards. The web's
   boot resend covers the shells old enough to have no config store.
7. **Every existing install starts on `system`.** The detector's stored value is not migrated, and
   neither is the old shell envelope — both held the language in effect, where a guess and a pick
   cannot be told apart.

## Alternatives

**Keep the detector and change its lookup order** (`navigator` before `localStorage`). The smallest
diff. Rejected: the order is exactly what made a manual choice survive a reload, so reordering it
either keeps the pinned-forever bug or drops every choice on the next boot, and it still never reads
the shell's value — iOS would keep answering `en-US`.

**`persist: 'local'`, read from the mirror alone.** The early read would have a single place to look,
and nothing native reads the choice today. Rejected: it takes the language off the path the theme
already uses to reach the shell, so the native app could never follow a pin without the web changing
again. The early read's cost — checking the envelope before the mirror — is two lookups.

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
- The shell only follows a pin from the app release that carries decisions 5 and 6. Until a device
  updates, the web changes and the shell keeps the device language.
- The App Group id and key are duplicated between the shell's module and the iOS extension, like the
  badge and push-mark keys, and have to change together.
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
