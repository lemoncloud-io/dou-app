# local-run — the WebView against a local web dev server

Runs the shell against `apps/web`'s dev server instead of a deployed build, the same way
`web:start` and `desktop:start:local` already do for their apps. Because the app is a native shell
around a WebView, most screen work is web work, and seeing it live in the shell needs one command
rather than a manual env edit and a native rebuild.

## Layout

| Path                                                                                                                      | Role                                     |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `apps/mobile/.env`, `.env.dev`, `.env.prod`                                                                               | local / dev-build / prod-build env files |
| `apps/mobile/.env.example`                                                                                                | template for `.env`                      |
| [`src/app/utils/stage.ts`](../src/app/utils/stage.ts)                                                                     | `Config.VITE_ENV` → `Env` conversion     |
| [`src/app/services/deeplinks/deeplinkUtils.ts`](../src/app/services/deeplinks/deeplinkUtils.ts)                           | `getAppScheme()`                         |
| [`android/app/src/main/res/xml/network_security_config.xml`](../android/app/src/main/res/xml/network_security_config.xml) | Android cleartext allowlist              |
| root `package.json`                                                                                                       | every `mobile:*` script                  |

## Responsibilities

Local run decides which env file a build reads and where the WebView loads from. It does not decide
the WebView address at runtime — that stays fixed at build time (see below) — and it does not touch
real devices: LAN IPs, iOS ATS exceptions and Android cleartext exceptions for a physical phone are
out of scope. Simulator and emulator only.

## The shared contract

**The env files mean the same thing everywhere.** `.env` is local, `.env.dev` is the dev build,
`.env.prod` is the prod build — the rule `apps/web`, `apps/desktop` and `apps/admin-v2` already
follow. `apps/mobile/.env.example` is the local template:

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

`VITE_WEBVIEW_BASE_URL` defaults to `http://localhost:5003` and needs no edit. Values that don't
vary between local and dev (IAP SKUs, `VITE_GOOGLE_WEB_CLIENT_ID`) can be copied over from
`.env.dev`.

**Which env file a build reads is a build-configuration setting, not a script.** A script may
override it, but the mapping itself has to live where a GUI build (Xcode, Android Studio) can also
see it — a GUI build has no shell environment for a script to override.

| Platform | Mapping lives in                                                                                                                                                                   | dev        | prod        | local override                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------- | ------------------------------ |
| iOS      | per-configuration `ENVFILE` build setting, next to `APP_URL_SCHEME`, in [`project.pbxproj`](../ios/Chatic.xcodeproj/project.pbxproj) (`Debug`/`Release`/`Debug Dev`/`Release Dev`) | `.env.dev` | `.env.prod` | `--extraParams "ENVFILE=.env"` |
| Android  | `envConfigFiles` in [`build.gradle`](../android/app/build.gradle)                                                                                                                  | `.env.dev` | `.env.prod` | `ENVFILE=.env`                 |

`ENVFILE` sits beside `APP_URL_SCHEME` deliberately: scheme registration and env selection move
together, and `getAppScheme()` below depends on that pairing staying in sync.

**The WebView address is fixed at build time, on purpose.** There is no runtime switcher — the
capability was removed because it let the web page redirect the shell to a different origin over
the same bridge. Changing the address means rebuilding.

**The address is the same on iOS and Android:** `http://localhost:5003`. iOS reaches it directly —
the simulator shares the host's loopback, and `Info.plist`'s ATS exception for `localhost` lets the
plain-http request through. Android needs one extra step, because the emulator's own `localhost` is
not the host's:

```bash
adb reverse tcp:5003 tcp:5003
```

This forwards the emulator's `localhost:5003` to the host, so
[`apps/web/vite.config.mts`](../../web/vite.config.mts)'s dev server never needs to bind beyond
`localhost`. `network_security_config.xml` allows cleartext for `localhost` and `10.0.2.2` only — no
developer's LAN IP is in the file. `adb reverse` does not survive an emulator restart; the local
scripts rerun it every time.

## Usage

```bash
yarn mobile:ios:local        # web dev server + Metro + iOS simulator
yarn mobile:android:local    # adb reverse + web dev server + Metro + Android emulator
```

Both run `mobile:local:check` first, which fails with the `cp` command above if `apps/mobile/.env`
is missing. Both use `concurrently` to run the web dev server (`yarn web:start`), Metro
(`yarn mobile:start`), and the platform run script together, building with `ENVFILE=.env`
overriding the build configuration's own mapping.

A dev or prod build (`yarn mobile:ios:dev`, `yarn mobile:android:dev`, and the `:prod` equivalents)
passes no `ENVFILE` — the build configuration alone decides, so the command looks the same as it did
before this env-file convention existed. Opening "Chatic Dev" directly in Xcode, or building the
matching flavor in Android Studio, reads `.env.dev` for the same reason: `ENVFILE` and
`envConfigFiles` are read by the build system itself, not by a wrapping script.

### Two env paths, and only one is live

`react-native-config` (`Config.VITE_*`) is the path above, read at native build time — the only one
local run uses. A second path exists: `babel-plugin-transform-inline-environment-variables` inlines
`process.env.VITE_*` into the Metro bundle, fed by `mobile:start`'s `dotenv -e apps/mobile/.env`. No
code reads it:

```bash
grep -rn "process\.env\.VITE_" apps/mobile/src libs/app-messages libs/bridges libs/device-utils libs/logger libs/shared
```

returns nothing across every lib mobile depends on, so changing `.env`'s meaning does not touch this
path. `dotenv-cli` exits 0 even when the file is missing, so `mobile:start` alone never breaks on a
missing `.env`.

### The deep-link scheme follows the same build setting

The OS-registered scheme comes from the build configuration too: `APP_URL_SCHEME` on iOS, the
per-flavor `appScheme` manifest placeholder on Android. When runtime code needs to rebuild a scheme
URL — React Navigation hands a warm-start deep link back as a path with no scheme —
[`getAppScheme()`](../src/app/services/deeplinks/deeplinkUtils.ts) recomputes it:

```ts
export const getAppScheme = (): (typeof CUSTOM_SCHEMES)[number] =>
    Config.VITE_ENV === 'PROD' ? 'chatic' : 'chatic-dev';
```

The test is `=== 'PROD'`, not `=== 'DEV'`: every non-prod configuration, including `LOCAL`,
registers `chatic-dev`. [`isCustomZipAllowed`](../src/app/customZip/customZipGate.ts) uses the same
`!== 'PROD'` polarity. Both call sites — `reconstructDeepLinkUrl` in the same file, and
[`DeeplinkService`](../src/app/services/deeplinks/DeeplinkService.ts)'s constructor — go through
`getAppScheme()` rather than recomputing it.

### The stage vocabulary the WebView is told about

`Config.VITE_ENV` (`LOCAL`/`DEV`/`PROD`) and `Env` (`local`/`stage`/`prod`) are different
vocabularies. [`toEnvStage()`](../src/app/utils/stage.ts) is the one place that converts; an
unrecognized value falls back to `'prod'`, the conservative direction, matching the old
`Config.VITE_ENV || 'PROD'` default. The result is injected as `window.CHATIC_APP_STAGE` (in
[`AppWebView`](../src/app/webview/AppWebView.tsx)) and sent again in the `OnUpdateDeviceInfo` bridge
event ([`useVersionCheckHandler`](../src/app/webview/hooks/useVersionCheckHandler.ts)); both payload
types narrow `stage` to `Env`, so a call site that forgets the conversion fails to compile.

On the web side, [`deviceInfoStore`](../../../libs/device-utils/src/stores/deviceInfoStore.ts) reads
the injected global through a lookup table rather than an `as Env` cast — the cast let
`'DEV'`/`'dev'` through unmapped. An unrecognized value there falls back to `'local'`.

**Desktop injects a different vocabulary on purpose and stays that way.** Desktop's
`window.CHATIC_APP_STAGE` is `'dev'`/`'prod'` verbatim, because the server assembles an SNS
application name from it (`<platform>-<application>-<stage>`, per ADR-0056/cross-cloud-push) and
that name is fixed as `chatic-desktop-{dev,prod}` — no `-stage` variant exists. Mobile's own push
registration never sends stage at all
([`useDeviceTokenRegistration.ts`](../../web/src/app/bridge/useDeviceTokenRegistration.ts) omits it
deliberately). So the outbound push string never changes; `deviceInfoStore`'s lookup table is what
absorbs all three spellings on the read side.

## Notes for implementers and tests

- The two iOS build-configuration schemes used to carry a build pre-action that ran
  `cp .env.dev .env` on every build, and `ReadDotEnv.rb` reads a leftover `/tmp/envfile` before the
  `ENVFILE` build setting — so a live pre-action silently wins over the table above and can
  overwrite a developer's local `.env`. Confirm neither `Chatic.xcscheme` nor `Chatic Dev.xcscheme`
  under `ios/Chatic.xcodeproj/xcshareddata/xcschemes/` has one before relying on this doc.
- `apps/mobile/.env` used to hold dev settings on iOS. Anyone with dev values still sitting in
  `.env` should move them to `.env.dev`, then recreate `.env` from `.env.example`.
- `VITE_WS_ENDPOINT` in `.env.example` is unused — kept only so the file's shape matches
  `.env.dev`/`.env.prod`.

## Further reading

- [webview-debugging.md](./webview-debugging.md) — attaching a remote inspector once the app is
  running, local or otherwise.
- [deploy.md](./deploy.md) — the dev/prod builds this doc's local override sits next to.
