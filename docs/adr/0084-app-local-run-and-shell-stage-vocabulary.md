# ADR-0084: introduce app local-run, and unify env-file meaning and shell stage vocabulary across the repo

> Status: Accepted · Decided: 2026-09-14 · Updated: 2026-09-17 (CLI flag spelling; decision unchanged)
> Scope: `apps/mobile` (env · deep links · injection · `project.pbxproj` · `*.xcscheme`) ·
> `libs/device-utils` · root `package.json` scripts ·
> `apps/mobile/android/app/src/main/res/xml/network_security_config.xml` ·
> `apps/mobile/docs/webview-debugging.md`
> Related: [ADR-0080](./0080-debug-panel-shared-model-and-stage-visibility.md) (Decision 13 — removed the
> runtime web-address switcher. **This document keeps that decision, not overturns it**) ·
> [ADR-0079](./0079-config-registry-and-lane-resolver.md) (config registry · Decision 14's vocabulary
> normalization) · [ADR-0077](./0077-register-push-device-once-per-install.md) (push device registration)

## Context

### The app has no local-run

The app is a native shell + WebView. The address the WebView looks at is `VITE_WEBVIEW_BASE_URL`, and
that value is baked in at native build time via react-native-config. Which file it reads differs by
platform.

| Platform | File read                | Basis                                                                  |
| -------- | ------------------------ | ---------------------------------------------------------------------- |
| iOS      | `apps/mobile/.env`       | react-native-config's default (`ReadDotEnv.rb`)                        |
| Android  | `.env.dev` / `.env.prod` | `android/app/build.gradle`'s `project.ext.envConfigFiles` (per flavor) |

Web comes up locally with one command, `yarn web:start`. Desktop has a counterpart too —
`desktop:start:local` starts the desktop-web dev server (5005) and Electron together via `concurrently`,
pointing at local with `MAIN_VITE_DESKTOP_WEB_URL=http://localhost:5005`. **Only mobile lacks this
counterpart.**

### Today's workaround has left marks on the repo

To connect to local web today, you edit your own LAN IP directly into `.env` (iOS) / `.env.dev`
(Android), and on Android also add that IP to `network_security_config.xml`, then rebuild native. The
result is committed as-is.

```xml
<domain includeSubdomains="true">192.168.1.13</domain>
<domain includeSubdomains="true">192.168.1.129:5003</domain>
<domain includeSubdomains="true">192.168.1.129</domain>
```

`apps/mobile/docs/webview-debugging.md:75` also has `192.168.1.129:5003` baked in as an example.

### The meaning of env files differs from the web family

web, desktop-web, and admin-v2 all use the same rule.

| File           | Meaning        | Basis                                                         |
| -------------- | -------------- | ------------------------------------------------------------- |
| `.env`         | **Local**      | What `<app>:start` reads. `.env.example` has `VITE_ENV=LOCAL` |
| `.env.dev`     | dev build      | Swapped in by `project.json`'s `fileReplacements`             |
| `.env.prod`    | prod build     | Same                                                          |
| `.env.example` | local template | Which is why it has `VITE_HOST=http://localhost:5003`         |

**Only mobile uses `.env` for dev.** `apps/mobile/.env.example` has `VITE_ENV=DEV`. And for the same "dev
build," different platforms read different files — iOS reads `.env`, Android reads `.env.dev`. This
difference comes from iOS riding on react-native-config's default, not from deliberate design.

On Android, `.env` is mapped by no flavor at all, so it is **already an empty slot**.

### The shell doesn't know about the backend

The shell reads only 7 keys from `react-native-config`, and **not one of them is a backend endpoint.**

| Key                         | Count | Use                                                 |
| --------------------------- | ----- | --------------------------------------------------- |
| `VITE_ENV`                  | 5     | Deep-link scheme · customZip gate · stage injection |
| `VIEW_APP_NAME`             | 2     | App display name                                    |
| `VITE_WEBVIEW_BASE_URL`     | 1     | The address the WebView looks at                    |
| IAP SKU · plan              | 3     | In-app purchase                                     |
| `VITE_GOOGLE_WEB_CLIENT_ID` | 1     | Google login                                        |

Everything that talks to the backend is web, and web reads its own `import.meta.env`
(`apps/web/src/app/config/adapters.ts:15`). **So "which backend local-run points at" is not a decision for
the app track** — `apps/web/.env` decides it, and the app just looks at that web.

`VITE_WS_ENDPOINT` exists only in two type declarations (`src/types/react-native-config.d.ts`,
`src/types/env.d.ts`) and in `.env.example`, with no code that reads it. It is dead.

### The deep-link scheme is registered by build config, but the runtime keeps a second copy of that mapping

The scheme registered with the OS is decided by the **build config**.

| Platform | Who registers it                                        | dev          | prod     |
| -------- | ------------------------------------------------------- | ------------ | -------- |
| iOS      | The `APP_URL_SCHEME` build setting (`project.pbxproj`)  | `chatic-dev` | `chatic` |
| Android  | The per-flavor `appScheme` placeholder (`build.gradle`) | `chatic-dev` | `chatic` |

But the runtime code computes the same mapping a second time, **based on the env file**.

```ts
// DeeplinkService.ts:35 · deeplinkUtils.ts:402 — the same logic, twice
const scheme = Config.VITE_ENV === 'DEV' ? 'chatic-dev' : 'chatic';
```

The two sources happen to agree today, because the env file only has two values (`DEV`, `PROD`), and
those two happen to pair by convention with the two build configs. Android's `envConfigFiles` actually
enforces that pairing, but on iOS it is just a developer convention of putting `DEV` in `.env` — not
wiring. **The moment a third value arrives, this breaks** — a dev build config plus `VITE_ENV=LOCAL` means
the OS registered `chatic-dev`, but the runtime computes `chatic`.

The same file family's `isCustomZipAllowed` already uses the opposite polarity (`!== 'PROD'`). Two gates
answer the same question with opposite polarity.

### Stage injection doesn't take in any shell

The shell injects `window.CHATIC_APP_STAGE`. Web's `webEnvAdapter.stage()` only matches the three
lowercase values `'local'` · `'stage'` · `'prod'` (`libs/config/src/adapters/webEnvAdapter.ts:46`).

| Shell   | Injected value                                | Match | Result                       |
| ------- | --------------------------------------------- | ----- | ---------------------------- |
| Mobile  | `'DEV'` / `'PROD'` (`injectionScripts.ts:95`) | None  | Falls back to `buildStage()` |
| Desktop | `'dev'` (`preload/index.ts:26`)               | None  | Falls back to `buildStage()` |

**This is not just mobile's problem. All three are misaligned.** The `Env` type
(`libs/app-messages`) is `'local' | 'stage' | 'prod'`, and desktop's `'dev'` isn't even in that union.

The reason the mismatch went unnoticed is that there is only one consumer. Only
`libs/device-utils`'s `deviceInfoStore.ts:40` takes the raw value, via an `as Env` cast. The type
assertion has been erasing the compile error.

### This value is only sent as push on desktop

The server assembles the SNS platform application name from stage — `<platform>-<application>-<stage>`
(`@lemoncloud/chatic-pushes-api`'s `ApplicationModel`). So changing the vocabulary could break push. But
**who sends this value differs by platform.**

| Path                                                              | Sends stage?                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Mobile (`apps/web/.../useDeviceTokenRegistration.ts:45`)          | **No** — "deliberately NOT sent". The flavor's `google-services.json` carries the stage instead |
| Desktop (`apps/desktop-web/.../useDeviceTokenRegistration.ts:48`) | **Yes** — passes `window.CHATIC_APP_STAGE` straight through, bypassing `deviceInfoStore`        |

And the broker's vocabulary is not `Env`. `docs/specs/cross-cloud-push.md:63` pins the SNS platform app
to exactly two values, `chatic-desktop-{dev,prod}` — **`-stage` does not exist.**

`deviceInfoStore.stage`'s only consumers are two display-only spots (feedback report, debug-panel row).

### Constraints

- **ADR-0080 Decision 13.** The runtime web-address switcher (`EnvironmentSettingsScreen`) was
  deliberately removed on 2026-09-10. `ConfigKvService`'s class comment pins down "do not expose this
  again, and do not create a writable `debug.webviewBaseUrl` key either."
- **The web dev server binds only to `localhost`** (`apps/web/vite.config.mts`'s `server.host`).
- **The iOS ATS exception is `localhost` only** (`Info.plist`). Hitting a LAN IP over http passes on the
  simulator but is blocked on a real device.
- **The `ENVFILE` environment variable works on both platforms.** Android takes priority over
  `envConfigFiles` (`dotenv.gradle:27`), and iOS reads `ENV['ENVFILE']` (`ReadDotEnv.rb`).
- **iOS's `/tmp/envfile` overrides `ENVFILE`.** `ReadDotEnv.rb` checks this file **first**, and the build
  pre-action on both committed schemes (`Chatic.xcscheme` · `Chatic Dev.xcscheme`) writes it on every
  build. The same pre-action even **overwrites the developer's `.env`** with `cp .env.dev .env`.
- **react-native-config's codegen phase is `always_out_of_date: "1"`** (podspec). Changing the env file
  does not let Xcode skip the phase.
- **A GUI build cannot receive shell environment variables.** Building directly from Android Studio /
  Xcode gives no `ENVFILE`. Android's `envConfigFiles` still catches it via the flavor, but **iOS has no
  such mechanism.**
- **An xcodebuild command-line build setting wins over everything.** Passing
  `run-ios --extraParams "ENVFILE=..."` overrides the project's build setting. The nx executor schema
  already has `extraParams`. (The flag was later renamed `--extra-params` by the React Native CLI;
  the decision is unchanged, only its spelling — see `apps/mobile/docs/release/local-run.md` for the
  form that currently works.)
- **Web deploys before the app.** App deployment is hard to reverse.

## Decision

### 1. Local-run is build-time — the runtime switcher is not revived

The WebView address is still baked in at build time. What changes is only "which env file gets baked in."
ADR-0080 Decision 13 stands unchanged. `setWebviewBaseUrlOverride` stays with no caller, and no writable
`debug.webviewBaseUrl` registry key is created either.

Changing the address requires a rebuild. That is a cost this decision accepts, not a flaw.

### 2. The target is the iOS simulator and the Android emulator

Real devices are out of scope. LAN IP, adding an iOS ATS exception, and allowing Android cleartext all
follow from real-device support, and that trio is exactly what has been dirtying the repo up to now.

### 3. The address is `http://localhost:5003` on both platforms

The Android emulator connects via `adb reverse tcp:5003 tcp:5003`. `10.0.2.2` is not used.

The value of this choice is that **the address becomes identical across platforms.** A single `.env`
covers it, and it carries over cleanly when extending to real devices. And since `adb reverse` forwards
the device's loopback to the **host's** loopback, **the web dev server config needs no change at all** —
`host: 'localhost'` already reaches it.

The `localhost` entry in `network_security_config.xml` and the `localhost` exception in iOS ATS already
exist, so no native config needs adding either.

`adb reverse` is lost on every device reconnect. So the script re-establishes it right before every app
launch (Decision 7).

### 4. Introduce `VITE_ENV=LOCAL` for the app

`Stage` already has three values, `'LOCAL' | 'DEV' | 'PROD'`, and web already uses `LOCAL` locally. Only
the app was missing that value — that was the mismatch.

Flip the polarity at both deep-link scheme branches.

```ts
// before — a third value diverges from the build config
const scheme = Config.VITE_ENV === 'DEV' ? 'chatic-dev' : 'chatic';
// after — matches what the build config actually registers, and matches isCustomZipAllowed's polarity
const scheme = Config.VITE_ENV === 'PROD' ? 'chatic' : 'chatic-dev';
```

`isCustomZipAllowed` (`!== 'PROD'`) is left as is — it already passes `LOCAL` through. No change needed.

### 5. Unify env-file meaning with the web family — `.env` is local

No new file is created. The meaning of the three files is aligned with web, desktop-web, and admin-v2.

| File           | Meaning        | mobile today                   | After the change                                                             |
| -------------- | -------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| `.env`         | Local          | iOS's dev use (Android unused) | **Local** — `VITE_ENV=LOCAL` · `VITE_WEBVIEW_BASE_URL=http://localhost:5003` |
| `.env.dev`     | dev build      | Android dev flavor only        | **Both platforms'** dev build                                                |
| `.env.prod`    | prod build     | Android prod flavor only       | **Both platforms'** prod build                                               |
| `.env.example` | local template | dev template (`VITE_ENV=DEV`)  | **Local template** (`VITE_ENV=LOCAL`)                                        |

Developers create `.env` once by copying `.env.example` — exactly the same motion as creating
`apps/web/.env`. No derivation-generating script is created — mobile doing something web does not do
would itself be a new mismatch.

This decision has one side effect. **iOS's dev/prod builds now read `.env.dev` / `.env.prod` instead of
`.env`.** The situation where the same "dev build" was reading a different file per platform goes away.
Existing iOS developers need to move their current dev settings from `.env` into `.env.dev` once.

### 6. The build config decides which env is read — only local run overrides via command line

A GUI build (Android Studio · Xcode) cannot receive shell environment variables (§Constraints). So the
mapping lives in the build config, not in a script. Android already does this; iOS gets the same.

| Platform | Mapping owner                                         | dev        | prod        |
| -------- | ----------------------------------------------------- | ---------- | ----------- |
| Android  | `envConfigFiles` (`build.gradle`) — **unchanged**     | `.env.dev` | `.env.prod` |
| iOS      | a per-configuration `ENVFILE` build setting — **new** | `.env.dev` | `.env.prod` |

iOS's `ENVFILE` sits in the same place `APP_URL_SCHEME` already sits (per-configuration
`buildSettings`). Registering the scheme and choosing the env now live on the same axis, so this doesn't
add a second instance of the "build config and runtime both map it" problem flagged in Decision 4.

Only local-run overrides this mapping.

| Platform | How it's overridden                     | Basis                                                     |
| -------- | --------------------------------------- | --------------------------------------------------------- |
| iOS      | `run-ios --extra-params "ENVFILE=.env"` | A command-line build setting wins over everything         |
| Android  | `ENVFILE=.env` environment variable     | Takes priority over `envConfigFiles` (`dotenv.gradle:27`) |

Existing scripts like `mobile:ios:dev` do not get `ENVFILE` added. The build config already decides it —
adding it there too would put the same fact in two places.

**The build pre-action on both schemes is deleted.** `Chatic.xcscheme` · `Chatic Dev.xcscheme` were
writing `/tmp/envfile` on every build and overwriting the developer's `.env` with `cp .env.dev .env`
(§Constraints). That has been the mechanism deciding "which env does this scheme read" up to now, and the
new `ENVFILE` build setting achieves the same scheme→configuration mapping **without touching `.env`.** If
the pre-action stays, `/tmp/envfile` beats `ENVFILE`, this whole decision becomes dead code, and Decision
5's "`.env` = local" gets erased on the very first build.

After this, nothing creates `/tmp/envfile` through any path.

### 7. Scripts are a full per-platform set

Two scripts: `mobile:ios:local` and `mobile:android:local`. Each does, in order:

1. Confirm `apps/mobile/.env` exists — if not, tell the developer to copy `.env.example` and stop
2. (Android only) `adb reverse tcp:5003 tcp:5003`
3. Bring up the web dev server (5003) and Metro together via `concurrently`
4. Build and install native using Decision 6's override

`adb reverse` must run before the app launches and is lost on every device reconnect, so the script owns
the whole run through app launch. No separate "just start the servers" script is created — that would
require a human to time the `adb reverse` step correctly.

The names follow the mobile family's grammar (`mobile:<platform>:<stage>`). Web's `start` sits in a verb
slot the mobile family doesn't have, so there's nowhere to carry that name over to. What unification
actually means here is **the stage vocabulary becomes 1:1 with `Stage`'s three values** — web is `start` /
`build:dev` / `build:prod`, mobile is `ios:local` / `ios:dev` / `ios:prod`. It is also 1:1 with the three
env files (Decision 5).

`mobile:start` (Metro) is left untouched. Its meaning differs from web's `web:start` (one boots the app,
the other only starts the bundler), and renaming it would break existing workflows. That is not this
track's job to take on.

### 8. Remove the private IPs from `network_security_config.xml`

Delete the three entries `192.168.1.13`, `192.168.1.129`, and `192.168.1.129:5003`. With Decision 3 all
that's needed is `localhost`, so these are now all dead entries. The example in
`webview-debugging.md:75` is also fixed to `localhost:5003`.

The S3 domain entry stays — it's the customZip download path.

### 9. Unify the `CHATIC_APP_STAGE` vocabulary

**Only mobile's injected value is aligned with the `Env` vocabulary (`'local' | 'stage' | 'prod'`).
Desktop is left untouched.**

| Shell   | Today                      | After                            | Why                                                           |
| ------- | -------------------------- | -------------------------------- | ------------------------------------------------------------- |
| Mobile  | `'LOCAL'`/`'DEV'`/`'PROD'` | `'local'` / `'stage'` / `'prod'` | Not sent as push, so it's safe to change                      |
| Desktop | `'dev'` / `'prod'`         | **Unchanged**                    | This value _is_ the SNS app name — the server has no `-stage` |

Changing desktop to `'stage'` would register a dev-channel install against a nonexistent
`chatic-desktop-stage`, breaking delivery with a FCM SENDER_ID_MISMATCH
(`docs/specs/cross-cloud-push.md:63`). Keeping push alive comes before unifying vocabulary.

Instead, **the reading side absorbs all three vocabularies.** `deviceInfoStore.ts`'s `as Env` cast becomes
a mapping table that accepts the `Env` canonical values, desktop's `'dev'`, and legacy mobile's uppercase
values. The legacy-values row is not optional — since web deploys before the app, without it the new web
would mislabel every existing install as `'local'`.

**Nothing sent as push changes at all.** Mobile doesn't send stage, and desktop is out of this decision's
scope (§Context).

What changes is only that the injected value is, for the first time, actually matched by
`webEnvAdapter.stage()`. Combinations where the stage already agreed produce the same result.

| Combination             | Before | After   |
| ----------------------- | ------ | ------- |
| dev app + dev web       | DEV    | DEV     |
| prod app + prod web     | PROD   | PROD    |
| local app + local web   | LOCAL  | LOCAL   |
| **dev app + local web** | LOCAL  | **DEV** |

Only the last row flips. That's exactly the case of today's practice — hand-editing a LAN IP into `.env`
to reach local — and Decision 7's script replaces it, so there is no reason to keep the old behavior.

> The injected value taking effect also means page JS can override `window.CHATIC_APP_STAGE` to redirect
> the transport project to `_local`. But at that point, arbitrary JS execution is already possible, and
> the security gate, `debug.*` keys, reads `buildStage()` rather than the injected value (ADR-0079
> Decision 5), so there is no impact.

### 10. Debug panel entry stays as is

The 10-tap gesture plus `VITE_DEBUG_CODE` entry stays. Being local does not auto-unlock it. Carving an
exception into a fail-closed gate is not this track's job to take on.

### Scope

**In**

- `apps/mobile` — the two deep-link scheme branches · `injectionScripts.ts`'s stage injection ·
  `.env.example` (as a local template)
- `apps/mobile/ios/Chatic.xcodeproj/project.pbxproj` — new per-configuration `ENVFILE` build setting
- `apps/mobile/ios/.../xcschemes/*.xcscheme` — remove the build pre-action that overwrote `.env`
- `libs/device-utils/src/stores/deviceInfoStore.ts` — `as Env` cast → vocabulary mapping table
- Root `package.json` — `mobile:ios:local` · `mobile:android:local`
- `network_security_config.xml` · `webview-debugging.md` — clean up private IPs
- `README.md` · `apps/mobile/docs/` — local-run procedure and **notice of the `.env` meaning change**

**Out**

- Real-device support (Decision 2)
- Runtime web-address switcher (Decision 1)
- Relaxing debug panel entry (Decision 10)
- Changes to the customZip path
- `apps/web`'s vite config — Decision 3 makes this unnecessary
- **`apps/desktop` · `apps/desktop-web`** — Decision 9. Desktop's stage is push-broker vocabulary and is
  not touched
- `mobile:start` (Metro)'s name (Decision 7)
- `android/app/build.gradle`'s `envConfigFiles` — already correct, untouched
- Removing the dead `VITE_WS_ENDPOINT` entry — a separate matter (§Next steps)

## Alternatives

**Revive the runtime switcher.** Changing the address inside the app avoids a rebuild, the most
convenient option. Rejected — this would overturn ADR-0080 Decision 13, which blocks a concrete threat:
"web changing, via the bridge, the address it itself will be loaded from." It could be narrowed to a
dev-build-only gate, but the only thing gained is saving one rebuild, which doesn't justify the cost.

**Extend customZip.** No new surface, since a local static-server path already exists. Rejected — a zip
is a snapshot and can't provide HMR, which is the whole point of local-run.

**Pin Android to `10.0.2.2`.** No extra command, and it's already in `network_security_config`. Rejected
— `.env` would split by platform, the case for removing private IPs would weaken, and extending to real
devices would introduce yet a third addressing scheme.

**Keep the app on `VITE_ENV=DEV`.** No need to touch the deep-link branches. Rejected — web already uses
`LOCAL` locally, and `Stage` already has all three values. Keeping the app on two values splits the
vocabulary, and the debug panel's `env.buildStage` would call a local build "DEV."

**Split local into `.env.local`.** Leaves the existing `.env` untouched, so no move for iOS developers.
Rejected — this adds a fourth file the web family doesn't have, and leaves mobile's exception of "`.env`
is for iOS dev" intact. Deriving it from `.env.dev` was also rejected alongside this — mobile doing what
web doesn't do is itself a new mismatch, and there are only two keys to override anyway, so derivation
isn't worth much.

**Redefine `mobile:start` as local-run.** Take web's `start = local` convention literally. Rejected — that
name is already Metro's, and changing it breaks existing workflows and docs at once. Matching stage
vocabulary (Decision 7) is the substance of unification, more than the name.

**Have iOS pass `ENVFILE` from the script too.** Avoids touching the build setting. Rejected — building
"Chatic Dev" directly from the Xcode GUI has no `ENVFILE`, so it falls through to `.env` (local). The
moment Decision 5 changes `.env`'s meaning, this becomes a real incident.

**Fix stage vocabulary on both platforms.** This was the original decision. Review found that desktop's
injected value is literally the SNS platform app name and the server has no `-stage`
(`docs/specs/cross-cloud-push.md:63`), so only mobile was kept. Desktop needs backend groundwork first.

**Don't touch stage vocabulary at all.** If local-run alone were scoped, there'd be no need to touch the
injected value. Rejected — a third value for `VITE_ENV` is exactly what this track introduces, and
leaving the injection site unfixed just adds one more mismatch.

## Consequences

### What is gained

- App local-run becomes one command, matching the shape of web and desktop.
- **The meaning of the three env files becomes one thing across the whole repo.** `.env` is local in
  every app.
- **The same "dev build" reading different files per platform" goes away.**
- Committing private IPs to the repo stops.
- The deep-link scheme's two sources (build config / runtime) now agree even at the third stage value.
- The three shells' stage vocabulary becomes one, and the injected value actually starts taking effect.
- The new scripts are just 2 `package.json` entries. No generator, no new env file.

### Trade-offs accepted

- **Existing iOS developers need to move their `.env` dev settings into `.env.dev` once.** Since no
  automatic migration is added, documentation is the only vehicle for this move. It's written into
  `README.md` and `apps/mobile/docs/`.
- **`project.pbxproj` gets touched.** A file with frequent merge conflicts. But the addition is one line
  across four configurations, right next to `APP_URL_SCHEME`.
- **Changing the address requires a rebuild.** The price of giving up the runtime switcher.
- **The injected vocabulary stays different per platform.** Mobile uses `Env`, desktop uses
  `'dev'`/`'prod'`. This isn't giving up on unification — desktop's value is an SNS app name the server
  owns, and the client alone can't change it. The reading-side mapping table absorbs the difference.
- **Real devices are still manual.** Same as today. Not made worse.
- **`adb reverse` is lost on every device reconnect.** The script has to be rerun.

### When to reverse

Decisions 1–4 and 7–8 are easy. Delete the new scripts and flip the deep-link polarity back.

**Decisions 5–6 need a human hand once more.** Reversing means deleting iOS's `ENVFILE` build setting and
restoring `.env` back to dev settings — since it's a per-developer local file, this can't be reverted by
code. But if it's done wrong, the failure isn't quiet (the build comes up pointed at local). It's caught
fast.

**Decision 9 is also easy.** Because desktop is out of scope, nothing sent as push changes at all.
Mobile's injected value only reaches two display-only consumers, and the reading-side mapping table
accepts even the legacy injected value, so it's safe even with web deploying first.

## Next steps

- **Unify desktop's stage vocabulary** — possible only after an SNS app `chatic-desktop-stage` is created
  on the server and credentials are matched. Backend groundwork, so it's out of this scope.
- **`isCustomZipAllowed`'s fail-open** — when `VITE_ENV` is empty, `!== 'PROD'` evaluates true and falls
  through to allowed. In the same situation, `toEnvStage` fails closed to `'prod'`. The polarities should
  match.
- Remove the dead `VITE_WS_ENDPOINT` entry — `apps/mobile/.env.example` ·
  `src/types/env.d.ts` · `src/types/react-native-config.d.ts`. Independent of this track.
- iOS's `webviewDebuggingEnabled` is unset — an existing gap already flagged by
  `webview-debugging.md`. As local-run becomes common, it will be hit more often.
- Real-device local-run — how to handle the ATS exception and LAN IP resolution is decided separately.
- Implementation and architecture documentation live in
  [apps/mobile/docs/local-run.md](../../apps/mobile/docs/local-run.md).
