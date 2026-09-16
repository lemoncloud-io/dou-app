# stores — global client state, and the preference-store migration

Covers `apps/web/src/app/stores` (8 files) and the handful of `app/hooks`/feature hooks that read
and write settings through it. Two different things live under this one folder name, and the
folder itself only fully explains the first:

1. **Transient client-only state** — four zustand stores, none of them persisted.
2. **Preference plumbing** — types, constants and defensive parsers for the settings that used to
   live in a single `usePreferenceStore` and now live in [`@chatic/config`](../../../../libs/config/README.md)'s
   `ui.*` registry keys (ADR-0079/0080). The lane/persistence policy is that library's canon; this
   section says only how apps/web wires into it.

## Transient zustand stores

None of these persist anything — each is scoped to one interaction and reset (or simply
unmounted) when it ends.

| Store                     | File                         | Holds                                                                                                                                                                |
| ------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useMessageJumpStore`     | `useMessageJumpStore.ts`     | The pending "scroll to this message" target for a search-result jump, keyed by `channelId`/`chatNo` plus a `nonce` so a repeat jump to the same message still fires. |
| `useAddCloudRequest`      | `useAddCloudRequest.ts`      | Whether the "add a cloud" flow should open, raised from `home` and consumed by `AddCloudFlowHost`.                                                                   |
| `useEmailBindRequest`     | `useEmailBindRequest.ts`     | The cloud id awaiting an email bind, raised from wherever a screen notices an unbound cloud and consumed by `EmailBindRequestHost`.                                  |
| `usePendingInviteChannel` | `usePendingInviteChannel.ts` | The channel id to open once an invite acceptance lands the user on `home`.                                                                                           |

`useAddCloudRequest` and `useEmailBindRequest` exist because features do not import each other
(design principle 4 in the [app README](../../README.md)): the subscription flow and the screens
that need to trigger it live in different feature folders, so triggering it goes through a store
that a runtime-mounted host (not a feature) subscribes to.

## The preference-store migration

Permanent app settings are no longer one `usePreferenceStore` — they moved to `@chatic/config`'s
registry keys (`ui.*`). `app/stores/` keeps only the parts that have nothing to do with where a
value is stored:

- `preferenceKeys.ts` — the `Theme` and `ChannelSortMethod` types, `DEFAULT_CHANNEL_SORT`,
  `CLOUD_PROMO_DISMISS_TTL_MS`, `MAX_RECENT_SEARCHES`.
- `preferenceParsers.ts` — defensive parse/normalize functions for the `type: 'json'` keys
  (`channelSort`, `recentSearches`, `cloudPromoDismissedAt`) plus `parseThemeBridgeValue` for the
  legacy native theme envelope. `@chatic/config` only validates that a `json`-typed value is
  parseable JSON; it has no notion of what shape a "channel sort map" should have, so that
  product-shape validation lives here.

The per-place pin and order primitives moved further out, to
[`@chatic/shared`](../../../../libs/shared/README.md)'s `libs/shared/src/preferences/` — not to
this folder — because desktop-web needs to read the exact same record apps/web writes:
`placeScopeKey`/`isPlaceScopeKey` (`placeScope.ts`), `normalizePinnedChannels`/`setChannelPinned`/
`setPinnedChannelOrder`/`usePinnedChannels(scope)` (`pinnedChannels.ts`), and the parallel
`normalizeChannelOrder`/`setChannelOrder`/`applyChannelOrder`/`moveChannel`/`useChannelOrder(scope)`
(`channelOrder.ts`) for the sidebar's non-favorite ordering.

### Registry keys and their hooks

| Registry key                | Retired `PreferenceState` field       | Consuming hook                                        |
| --------------------------- | ------------------------------------- | ----------------------------------------------------- |
| `ui.theme`                  | `theme`                               | `useTheme` (`app/hooks`) — see [theme.md](../shell/theme.md) |
| `ui.blurLastMessage`        | `blurLastMessage`                     | `useBlurLastMessage` (`app/hooks`)                    |
| `ui.onboardingCompleted`    | `isFirstRun` (opposite polarity)      | `useOnboarding` (`app/hooks`)                         |
| `ui.pushMuted`              | `pushMuted`                           | `useDevicePushMute` (`features/mypage/hooks`)         |
| `ui.channelSort`            | `channelSort`                         | `useChannelSort` (`app/hooks`)                        |
| `ui.pinnedChannels`         | `pinnedChannels`                      | `usePinnedChannels` (`@chatic/shared`)                |
| `ui.channelOrder`           | — (new registry key, no legacy field) | `useChannelOrder` (`@chatic/shared`)                  |
| `ui.recentSearches`         | `recentSearches`                      | `useRecentSearches` (`features/search/hooks`)         |
| `ui.dismissedUpdateVersion` | `dismissedUpdateVersion`              | `useAppUpdatePrompt` (`features/appUpdate/hooks`)     |
| `ui.cloudPromoDismissedAt`  | `cloudPromoDismissedAt`               | `useCloudPromo` (`features/home/hooks`)               |

Every hook reads with `useConfigValue('ui.x')` (`@chatic/config/react`) and writes with
`config.set('ui.x', value, { lane })` — **the lane is fixed per key, not a caller's choice.** The
three keys with `persist: 'shell'` (`theme`, `blurLastMessage`, `onboardingCompleted`) must write
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

## Out of scope (deliberately)

- **`debugSettings`** (`chatic_debug_mode`) — a dead declaration even under `usePreferenceStore`:
  the URL-toggle feature it backed was removed (ADR-0080 decision 13). Never became a config key.
- **`language`** — nothing in the repo reads or writes `chatic-language`. The actual UI language is
  owned end-to-end by i18next's `LanguageDetector`, under its own separate key
  (`@${PROJECT}_${ENV}.i18nextLng`). A `ui.language` registry key is declared in
  `libs/config/src/registry/ui.ts` but has no consumer yet — folding i18next into `@chatic/config`
  is a separate, larger piece of work.
- **Mobile's `debugSettingsStore`** (`mockServiceMode`, `overlay*`, …) — apps/web has no screen that
  would use it, so it was never integrated. `logUploadHold`/`debugModeEnabled` already work through
  their own dedicated bridge messages, independent of this store.
- **Session and tokens** — owned by `web-core` / `@chatic/app-runtime`, not this folder.
