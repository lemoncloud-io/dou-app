# stores — global client state, and the preference-store migration

Covers `apps/web/src/app/stores` (10 files) and the handful of `app/hooks`/feature hooks that read
and write settings through it. Two different things live under this one folder name, and the
folder itself only fully explains the first:

1. **Transient client-only state** — five zustand stores, none of them persisted.
2. **Preference plumbing** — types, constants and defensive parsers for the settings that used to
   live in a single `usePreferenceStore` and now live in [`@chatic/config`](../../../../libs/config/README.md)'s
   `ui.*` registry keys (ADR-0079/0080). The lane/persistence policy is that library's canon; this
   section says only how apps/web wires into it.

## Transient zustand stores

None of these persist anything. Most are scoped to one interaction and reset (or simply unmounted)
when it ends; `useChannelSyncMarkStore` is the exception — it only ever accumulates, for the life of
the app session, and a relaunch re-earns every mark from an empty store.

| Store                     | File                         | Holds                                                                                                                                                                |
| ------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useMessageJumpStore`     | `useMessageJumpStore.ts`     | The pending "scroll to this message" target for a search-result jump, keyed by `channelId`/`chatNo` plus a `nonce` so a repeat jump to the same message still fires. |
| `useAddCloudRequest`      | `useAddCloudRequest.ts`      | Whether the "add a cloud" flow should open, raised from `home` and consumed by `AddCloudFlowHost`.                                                                   |
| `useEmailBindRequest`     | `useEmailBindRequest.ts`     | The cloud id awaiting an email bind, raised from wherever a screen notices an unbound cloud and consumed by `EmailBindRequestHost`.                                  |
| `usePendingInviteChannel` | `usePendingInviteChannel.ts` | The room an accepted invite hands over, opened by `useOpenPendingInviteChannel` wherever leaving the accept screen lands.                                            |
| `useChannelSyncMarkStore` | `useChannelSyncMarkStore.ts` | Which clouds have had their channel delta answered this session, so an empty cache is not read as an empty cloud — [data-flow.md](./data-flow.md).                   |

`useAddCloudRequest` and `useEmailBindRequest` exist because features do not import each other
(design principle 4 in the [app README](../../README.md)): the subscription flow and the screens
that need to trigger it live in different feature folders, so triggering it goes through a store
that a runtime-mounted host (not a feature) subscribes to.

## The preference-store migration

Permanent app settings are no longer one `usePreferenceStore` — they moved to `@chatic/config`'s
registry keys (`ui.*`). `app/stores/` keeps only the parts that have nothing to do with where a
value is stored:

- `preferenceKeys.ts` — the `Theme`, `ChannelSortMethod` and `HomeSectionId` types,
  `DEFAULT_CHANNEL_SORT`, `CLOUD_PROMO_DISMISS_TTL_MS`, `MAX_RECENT_SEARCHES`.
- `preferenceParsers.ts` — defensive parse/normalize functions for the `type: 'json'` keys
  (`channelSort`, `homeSectionsCollapsed`, `recentSearches`, `cloudPromoDismissedAt`) plus
  `parseThemeBridgeValue` for the legacy native theme envelope. `@chatic/config` only validates
  that a `json`-typed value is parseable JSON; it has no notion of what shape a "channel sort map"
  should have, so that product-shape validation lives here.

The per-place pin and order primitives moved further out, to
[`@chatic/shared`](../../../../libs/shared/README.md)'s `libs/shared/src/preferences/` — not to
this folder — because desktop-web needs to read the exact same record apps/web writes:
`placeScopeKey`/`isPlaceScopeKey` (`placeScope.ts`), `normalizePinnedChannels`/`setChannelPinned`/
`setPinnedChannelOrder`/`usePinnedChannels(scope)` (`pinnedChannels.ts`), and the parallel
`normalizeChannelOrder`/`setChannelOrder`/`applyChannelOrder`/`moveChannel`/`useChannelOrder(scope)`
(`channelOrder.ts`) for the sidebar's non-favorite ordering.

### Registry keys and their hooks

| Registry key                | Retired `PreferenceState` field       | Consuming hook                                               |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| `ui.theme`                  | `theme`                               | `useTheme` (`app/hooks`) — see [theme.md](../shell/theme.md) |
| `ui.blurLastMessage`        | `blurLastMessage`                     | `useBlurLastMessage` (`app/hooks`)                           |
| `ui.onboardingCompleted`    | `isFirstRun` (opposite polarity)      | `useOnboarding` (`app/hooks`)                                |
| `ui.pushMuted`              | `pushMuted`                           | `useDevicePushMute` (`features/mypage/hooks`)                |
| `ui.channelSort`            | `channelSort`                         | `useChannelSort` (`app/hooks`)                               |
| `ui.pinnedChannels`         | `pinnedChannels`                      | `usePinnedChannels` (`@chatic/shared`)                       |
| `ui.channelOrder`           | — (new registry key, no legacy field) | `useChannelOrder` (`@chatic/shared`)                         |
| `ui.homeSectionsCollapsed`  | — (new registry key, no legacy field) | `useHomeSections` (`features/home/hooks`)                    |
| `ui.recentSearches`         | `recentSearches`                      | `useRecentSearches` (`features/search/hooks`)                |
| `ui.dismissedUpdateVersion` | `dismissedUpdateVersion`              | `useAppUpdatePrompt` (`features/appUpdate/hooks`)            |
| `ui.cloudPromoDismissedAt`  | `cloudPromoDismissedAt`               | `useCloudPromo` (`features/home/hooks`)                      |
| `ui.language`               | — (the legacy field was never used)   | `useLanguagePreference` (`features/mypage/hooks`)            |

Every hook reads with `useConfigValue('ui.x')` (`@chatic/config/react`) and writes with
`config.set('ui.x', value, { lane })` — **the lane is fixed per key, not a caller's choice.** The
four keys with `persist: 'shell'` (`theme`, `language`, `blurLastMessage`, `onboardingCompleted`) must write
with `{ lane: 'shell' }`: a `local` write lands in a lower-priority row than a native-hydrated
`shell` value and is silently shadowed (`ConfigLanePolicy`'s row order, in the
[`@chatic/config` README](../../../../libs/config/README.md)). Every other key here is
`persist: 'local'`, written with `{ lane: 'local' }`.

```bash
grep -rn "lane: 'shell'" apps/web/src/app/hooks apps/web/src/app/features --include='*.ts'
```

`canceledInvites` is not in this table — it never became a config key. It is legacy,
ADR-0043-era cancel-stamp data that `useInviteDismissMigration.ts`
(`features/invite/hooks/`) reads directly off its old localStorage key
(`dou.relayInvite.locallyCanceled.v1`) and drains, one-way, into the invite cache's
`dismissedAt` field. `language` and `debugSettings` are also absent: `usePreferenceStore` never
actually managed either (see "Out of scope" below), so neither moved.

## Storage model

`@chatic/config`'s lane and `persist` policy is canonical (linked above). Two things are specific
to how apps/web sits on top of it:

1. **A `persist: 'shell'` key is written to both the native bridge and a local mirror.**
   `ConfigFacade` resolves `storageFor('shell')` to `local` storage too, so a value written on a
   plain browser tab (no shell) still survives the next reload — when a shell is present, its
   `shell` lane always wins (the priority order never changes).
2. **`ui.theme` is the one exception.** Its storage key is not `@chatic/config`'s namespaced key
   (`@chatic/config.ui.theme`) — it is still the legacy `vite-ui-theme`, because five apps
   (web, desktop-web, admin-v2, testbed, block-kit-builder) read and write that exact key directly
   in their pre-paint scripts, and `@chatic/theme`'s `ThemeProvider` does too. `syncThemeFromSharedKey()`
   in `app/config/legacyPreferenceMigration.ts` re-mirrors `vite-ui-theme` into `ui.theme`'s
   namespaced storage on every boot, and `useTheme.ts`'s `setTheme` writes `vite-ui-theme` directly
   in addition to calling `config.set()`. Full detail in [theme.md](../shell/theme.md).

## Legacy carry-over — `legacyPreferenceMigration.ts`

`main.tsx` calls `migrateLegacyPreferences()` **before** `config.init()`, because `hydrateStorage()`
(inside `init()`) is what reads the values this function writes.

- `migrateLegacyPreferences()` — one-time. Reads the old `chatic-*` localStorage keys, writes each
  decoded value under `storageKeyFor(newKey)`, then deletes the old key regardless of whether the
  decode succeeded. There is no completion flag: "does the old key still exist" is itself the
  completion check, so a user who already migrated (or never had a value) is a no-op on every later
  boot.
- `syncThemeFromSharedKey()` — the permanent, every-boot mirror described above. It is a mirror,
  not a migration, so it never deletes `vite-ui-theme`.

## Native hydration fallback — `PreferenceLoader`

Only three keys (`ui.blurLastMessage`, `ui.onboardingCompleted`, `ui.theme`) have an async fallback
to the legacy native bridge. Because web ships before the app, an app build old enough to not know
about the `CHATIC_APP_CONFIG_BAG` boot injection leaves `config.snapshot(key)?.isOverridden` false
for these keys. `PreferenceLoader` only fires in that case: it calls the legacy `FetchPreference`
bridge and writes the result with `{ lane: 'shell' }` — doing, slowly, what the boot injection would
have done, and leaving the value in the local mirror so the next boot resolves synchronously without
this fallback.

`isFirstRun` (legacy, `true` = onboarding not done) inverts to `onboardingCompleted` (`true` = done)
in that fallback path — the two fields have opposite polarity. The theme value can arrive in the
mobile zustand-persist JSON envelope, which `parseThemeBridgeValue` normalizes.

## The language choice — `ui.language`

It is stored the way the theme is. Settings' language sheet goes through `useLanguagePreference`
(`features/mypage/hooks/`), which makes three writes:

1. `config.set('ui.language', choice, { lane: 'shell' })` — the shell's config store, read back as
   the boot envelope (`CHATIC_APP_CONFIG_BAG`) on the next launch, and mirrored into
   `@chatic/config.ui.language` for a browser with no shell;
2. `SavePreference('language', choice)`, confirmed with one retry — the shell's own `languageStore`,
   which is what the shell's surfaces would follow. The choice goes over as is, `system` included;
3. `i18n.changeLanguage(...)`, so the screen follows at once.

**The shell does not read its store yet.** Its alert copy and the push banners its notification
services build all read the device locale directly, so today a pinned language changes the web and
nothing native. Making the shell follow is a shell change, and the value it needs is already there.

`src/i18n/index.ts` picks the boot language while it is being imported — before `main.tsx` has run
`config.init()` — so it cannot ask `config.get`. `readStoredLanguagePreference` reads the same two
places the resolver would, in the same order: the boot envelope, then the local mirror. The theme
has a pre-paint read for the same reason.

`PreferenceLoader`'s legacy `FetchPreference` fallback does **not** cover `ui.language`: the shell's
`languageStore` starts at the device language and nothing wrote a choice into it before, so reading
it back would turn a device default into a pin.

`system` is resolved on every boot, from the device languages in order — the shell's injected
`CHATIC_APP_CURRENT_LANGUAGE` first, then `navigator.languages`. The shell's value has to come first
because inside the iOS WebView `navigator.language` is the app bundle's localization, which is
English only, not the device's. Nothing supported → `en`.

This replaced i18next-browser-languagedetector, which wrote the language in effect into
`@${PROJECT}_${ENV}.i18nextLng` — the first-launch guess, and every change the old sheet made — and
read that back first ever after. The device setting was looked at once, and on iOS it answered
English for everyone. That stored value is not carried over: a guess and a choice sit in the same key
and cannot be told apart, and on iOS the stored `en` is the bug itself. **Every existing install
starts on `system`, and someone who had picked a language other than the device's picks it once
more.** The decision and its alternatives are ADR-0136.

The key is still written with the language in effect, because `relaySession` points lemon-web-core's
`x-lemon-language` header at `i18nextLng`. The SDK reads that name under its own prefix and storage
(`@<project>.i18nextLng`), which matches this key only in a native local build — so in deployed builds
the header is not sent, which was already true before the change.

## Out of scope (deliberately)

- **`debugSettings`** (`chatic_debug_mode`) — a dead declaration even under `usePreferenceStore`:
  the URL-toggle feature it backed was removed (ADR-0080 decision 13). Never became a config key.
- **`language`** — nothing in the repo reads or writes `chatic-language`, so there was nothing to
  carry over. The language choice is `ui.language` now (`system` · `ko` · `en`, default `system`),
  but it did not come through this store — see [above](#the-language-choice--uilanguage).
- **Mobile's `debugSettingsStore`** (`mockServiceMode`, `overlay*`, …) — apps/web has no screen that
  would use it, so it was never integrated. `logUploadHold`/`debugModeEnabled` already work through
  their own dedicated bridge messages, independent of this store.
- **Session and tokens** — owned by `web-core` / `@chatic/app-runtime`, not this folder.
