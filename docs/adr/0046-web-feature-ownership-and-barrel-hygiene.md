# ADR-0046: Sort component ownership in apps/web by domain feature, and stop barrels from re-exporting heavy modules

> Status: Accepted · Decided: 2026-08-06
> Related: [ADR-0013](./0013-home-screen-web-ui-kit-migration.md) (web-ui-kit first) · [ADR-0036](./0036-data-surface-unification-app-runtime-cleanup.md) (data surface unification)

## Context

A review of where the dialogs and shared components of `apps/web` live, and of their import paths,
turned up three things.

### 1. `features/home` became the parts warehouse for other features

home holds the most dialogs at 9, and other features pull some of them in. The `place`, `auth`, and
`subscription` features already exist, yet components of those domains live in home.

| What is in home                         | Real usage outside home                     |
| --------------------------------------- | ------------------------------------------- |
| `PlaceProfileCreateDialog`              | channels/pages, invite/accept, invite/pages |
| `PlaceProfileEditDialog`                | channels/pages                              |
| `PlaceProfileForm` (+ `FormDialog`)     | place/pages                                 |
| `EmailVerifyDialog` (+ `email-verify/`) | subscription/pages                          |
| 7 hooks in `home/hooks`                 | place, search, **ui/layouts**               |
| 3 modules in `home/lib`                 | place, search, **app/hooks**                |

By contrast `CreatePlaceDialog`, `CreateChannelDialog`, `CloudSessionSheet`,
`SubscriptionRequiredDialog`, `SubscriptionSelectDialog`, `ChannelList`, and `PlaceList` are
**home-only** (the 4 that looked like external references were all mentions in comments). So the
problem is not "home is big" but that **there was no ownership criterion, so things stayed where they
were first needed**.

### 2. Shared layers reference features backwards

`ui`/`app/hooks`/`app/utils` are layers below features, yet they reference features in 5 places.

- [ui/layouts/UnifiedLayout.tsx:7](../../apps/web/src/app/ui/layouts/UnifiedLayout.tsx) →
  `features/home/hooks` — it uses 3 hooks to get the unread total for the bottom nav badge. That is not
  home-only logic, it is an app-wide aggregate.
- [app/hooks/useActivePlaceName.ts:7](../../apps/web/src/app/hooks/useActivePlaceName.ts) →
  `features/home/lib`
- [app/utils/webVitals.ts:6](../../apps/web/src/app/utils/webVitals.ts) → `features/debug`
- `runtime/AppRuntime.tsx` → `features/home`, `features/issue-report`
- `runtime/InvitedCloudColdSyncRunner.tsx` → `features/notifications`

The last two are different in character, though — the runtime host is the **composition root that
mounts** the features' Runners, so knowing the features is normal. The violations are the first three.

### 3. Barrel bypasses repeat in more than 10 places, but the cause is the test setup, not the source

The comment "direct path instead of the barrel" repeats in more than 10 places for the same reason (the
`ui/layouts`, `ui`, `hooks`, `bridge`, and `channels/components` barrels). It is a symptom rather than
individual judgement, and the root is two configuration defects.

- **A wrong `@chatic/assets` mapping.** The greedy mapper in `jest.config.js`,
  `'^@chatic/(.*)$' → '<rootDir>/../../libs/$1/src/index.ts'`, sends `@chatic/assets` to
  `libs/assets/src/index.ts`. But `tsconfig.base.json` defines that alias as **`assets/src/index.ts` at
  the repo root**, and `libs/assets` does not exist. `@chatic/ui-kit/*` got an exception and `assets` was
  left out. → the moment the `ui/layouts` barrel drags in `PrivateLayout → @chatic/assets`, the tests
  break.
- **`import.meta` is compiled to CJS.** `tsconfig.spec.json` sets `"module": "commonjs"`, so ts-jest
  cannot parse `webTransport.ts` (`import.meta.env`) in `libs/web-core`. → the moment the `hooks` or
  `ui` barrel drags in web-core, the tests break.

So **defects in the test environment have been distorting the source structure.** The production build
(vite) works fine in both cases.

### Constraints

- This is limited to `apps/web`. `libs/web-core` is shared with desktop-web, so it is not touched this
  time.
- PR [#414](https://github.com/lemoncloud-io/dou-app/pull/414) is open. This refactor produces a broad
  diff of file moves plus import updates, so it starts after that PR.

## Decision

### 1. Break shared components into presentational and domain pieces, and send each to its own place

[directory-structure.md](../../apps/web/docs/README.md) already **forbids
direct imports between features**, limits `ui/` to presentational, and forbids `shared/` too. So there
was no permitted home for "a shared component with domain logic", and that is the cause of home becoming
a warehouse. Rather than overturn the rule, **split the component** so each piece satisfies the existing
rules.

Opening the code showed the split lines were already drawn — they were just in the wrong place.

| Piece                                     | Domain dependency                                        | Destination                                                                  |
| ----------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `PlaceProfileForm`                        | **none** (14 copy strings as props, `onSubmit` injected) | `ui/components`                                                              |
| `PlaceProfileFormDialog`                  | **none** (a one-line wrapper)                            | `ui/components`                                                              |
| `PlaceProfileCreateDialog` / `EditDialog` | `useRuntimeRepositories` → `setMyProfile`                | extract the save into a hook in `app/hooks`, copy presets to `ui/components` |
| `EmailVerifyDialog`                       | `useVerifyEmail` (web-core)                              | split the same way                                                           |

Home-only components are **not moved** (the second list above).

### 1-1. Sharpen the boundary of `ui/` from "presentational only" to "knows no domain entity"

The old rule was stricter than reality and nobody could keep it — `ReportIssueDialog` (`reportIssue`),
`ServiceUnavailableOverlay` (`useServiceUnavailable`), and `Sidebar` (`useSessionLogout`) in
`ui/components` already depend on web-core/app-runtime, and 10 files use i18n. An unkeepable rule
produced two evasions: leaving domain components sitting in home, and quietly adding dependencies to
`ui/`.

The new criterion: **`ui/` may know app-level concerns (session, service state, preferences, i18n) but
holds no knowledge of specific domain entities (place, channel, chat, profile).** By this criterion the
three above are not violations, and a wrapper calling `setMyProfile` is still excluded.

### 2. Promote hooks and utilities used by two or more areas to `app/hooks` · `app/utils`

- `useActiveCloudChannels` · `useChannelUnreads` · `useMyJoins` (ui/layouts + place + home)
- `useHomeChannels` · `useLastChat` (place)
- `useCachedCloudNames` · `useInvitedClouds` (search)
- `countUnread` · `readCursorOf` · `sortChannels` · `resolvePlaceDisplayName` → `app/utils`

`app/hooks` already holds domain hooks such as `useMyProfile`, `useActivePlaceName`, and
`useRelayInvites`, so it is not a new layer. This promotion turns the direction into
`ui/layouts → app/hooks`, and the three violations from context item 2 disappear.

### 3. State the layer direction rule

- `ui` · `app/hooks` · `app/utils` · `stores` **do not import `features/`.**
- The only exception is the **composition root**: `app.tsx` and `runtime/*` assemble the features' Runners
  and routes, so they may know the features.
- **The ban on direct imports between features stays** — the decomposition in decision 1 is the means that
  makes the ban keepable.

### 4. Barrels do not re-export heavy modules (+ one configuration defect is fixed in configuration)

- Add a `'^@chatic/assets$'` mapping to `jest.config.js` ahead of the greedy pattern. That alone removes
  the grounds for the `ui/layouts` and `ui` barrel bypasses.
- For barrels that drag in `import.meta` (`hooks`, `bridge`, and anything else that reaches web-core),
  **separate that module out of the barrel**. Fixing `libs/web-core` or switching jest to ESM would spread
  to desktop-web, so it is out of scope here.
- Direct paths that remain after the cleanup get **no explanatory comment** — if the reason is gone, use
  the barrel. Needing a comment reads as a signal that the cause is still there.

### Out of scope

- Introducing an internal path alias (`@/features/...`). There are 200 instances of `../../../`, but
  tsconfig, vite, and jest all have to line up, and the diff would mix with the move diff and make review
  impossible. Deferred to a separate track.
- Changing how `libs/web-core` uses `import.meta`.
- Creating a new shared feature layer such as `features/shared`.

## Alternatives

- **Move whole components to the domain-owning feature** (`PlaceProfile*` → `features/place`) and have
  other features import them — the least movement, but it requires overturning "no direct imports between
  features" from §2 of `directory-structure.md`. This was recommended early in the interview, then rejected
  after checking the existing document: that ban, together with junk-drawer prevention, is the foundation of
  that document, and once opened all that is left is the subjective criterion of "a direction that makes
  sense".
- **Promote whole components to `ui/components`** — the inter-feature imports go away, but `ui` comes to
  know the domain (`setMyProfile`). Splitting gets the same benefit while keeping the boundary, so
  rejected.
- **Create `features/shared`** — the boundary becomes clear, but it becomes the new collection point for
  "things whose home is unclear", with a high risk of repeating home's warehousing under another name.
  Rejected.
- **Move the hooks and utilities to `features/channels`** — it is true most of them are channel-related,
  but it becomes `ui/layouts → features/channels`, so the direction violation only changes name. Rejected.
- **Have `UnifiedLayout` take the unread total as props** — the most ideal option for keeping the shell
  ignorant of data, but every route host would have to inject it, which widens the change scope instead.
  Rejected.
- **Fix only the configuration and revive every barrel** — the most fundamental, but it means touching
  `import.meta` in `libs/web-core`, and that is a library shared with desktop-web. Deferred outside this
  track.
- **Move the files only and leave the barrels** — a short change, but the 10 bypasses remain and the same
  inconsistency recurs (the same component imported two ways, via the barrel and via a direct path).
  Rejected.

## Consequences

- `features/home` comes to hold only what belongs to the home screen, and other features reference the
  domain owner. The ownership criterion is written down, so the next component's home can be decided.
- The three backwards references from shared layers to features disappear, and the remaining two
  (composition root) are stated as permitted by the rule.
- Most barrel-bypass comments disappear, and the inconsistency of importing the same target through two
  paths is cleaned up. A remaining direct path becomes a signal that "there is still a reason here".
- **Trade-offs**
    - File moves plus import updates make for a wide diff (over 20 files including tests). There is no
      behaviour change, so the review hinges on confirming "moves and paths only" — which is why the alias
      introduction is not mixed into the same PR.
    - `app/hooks` grows (from 13 today to around 20). Splitting into per-domain subfolders happens when it
      becomes necessary.
    - The `import.meta` root cause remains. The constraint of keeping the `hooks` and `bridge` barrels slim
      persists, and the same care is needed when creating a new barrel.
    - Open work on a file being moved will conflict — this presumes starting after PR #414 is merged.
