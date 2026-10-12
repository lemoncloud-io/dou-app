# device-verify — a feature's scenario on the simulator or emulator, in one command

`yarn mobile:verify` builds the shell (or reuses the last build), boots a simulator or emulator,
serves this checkout's web and native JavaScript, and runs a feature's scenario against the real
app: the real WebView, the real native code, the real dev backend. It is how a developer or an agent
who just changed a feature sees it working on a device without knowing the dozen machine-specific
traps in between.

It is **opt-in and never a gate.** Not in CI, not a commit hook, not a required step of a PR. The
web's own tests, in a browser and in a fake native shell, cover what runs in the WebView; this is for
what only a real WebView and real native code can show — the photo library, the keyboard, a WebKit quirk, the
launch splash handoff. The procedure an agent follows around it — when to offer it, how to read each
outcome — is [`docs/config/skills/dou-device-verify`](../../../../docs/config/skills/dou-device-verify/SKILL.md).

## Usage

```bash
yarn mobile:verify home/open-room --platform ios       # one scenario
yarn mobile:verify home --platform android             # every scenario of a feature
yarn mobile:verify --tag smoke --platform ios          # every scenario tagged smoke
yarn mobile:verify --app-only --platform ios           # no scenario: launch the app and hold it up for hand checks
yarn mobile:verify --list                              # what exists
```

One platform per run, and one run per machine (see [One run at a time](#one-run-at-a-time)). Run iOS,
then Android — never both at once. `--help` lists the options; the ones worth knowing:

| Option          | Effect                                                                                  |
| --------------- | --------------------------------------------------------------------------------------- |
| `--web dev`     | load the deployed dev web instead of serving this checkout's — for a native-only change |
| `--rebuild`     | build even when the last build is still current                                         |
| `--app-only`    | run no scenario: launch the app once, then keep device, web and Metro up until stopped  |
| `--keep-device` | leave the device running afterwards, for hand checks on the same app                    |
| `--show-device` | open the simulator window / run the emulator with a window (default: headless)          |
| `--record`      | record a video of the run (Android caps it at 180 s)                                    |
| `--wait <min>`  | how long to wait for another device run or build to finish (default 15)                 |

### Exit codes

| Code | Meaning                                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------- |
| 0    | every selected scenario passed                                                                            |
| 1    | the app ran and a scenario failed — a product bug or a stale selector, to be read                         |
| 2    | the scenario could not run — a missing file, a missing tool, a busy machine, a failed build, a bad target |
| 130  | stopped with Ctrl-C or SIGTERM while running scenarios (`--app-only` ends with 0 that way, by design)     |

An exit 2 prints each problem with the command that fixes it. Running again without acting on it
gives the same result. The one exit 2 without a fix line is "The runner itself failed" followed by a
stack trace: that is a bug in the harness, to be reported, not an environment to repair.

### Output

Everything lands in `tmp/mobile-verify/<timestamp>-<platform>/` (gitignored): `build.log`, `web.log`,
`metro.log`, `device.log` (the Android emulator's output, and the recorder's with `--record`), and one
folder per scenario. That folder holds `final.png` (the screen when the scenario ended), every
`checkpoint-*.png` the scenario took, `maestro.log`, and Maestro's own record under a timestamped
subfolder — `commands.json` (every step and its status) and `screen-hierarchy/` (the accessibility
tree at a failed step), the first places to look when a step fails. The paths are printed as the run
goes.

`web.log` carries vite's and Tailwind's warnings — a `No cached ProjectGraph` error from an nx plugin
that only copies `*.md` files into a production build, ambiguous-class warnings. None of it stops the
web; a real failure shows as the web dev server not starting, which the runner reports itself.

## What you need once

macOS with Xcode (an iOS 26 simulator runtime and the iPhone 17 Pro device type), CocoaPods, the
Android SDK with the emulator and an arm64 Google APIs system image at API 29 or later (API 28 ships a
WebView too old to run `apps/web`), JDK 17+, and Maestro (below). The runner checks all of them
before it touches anything and says what is missing.

**Gitignored files.** These hold dev endpoints and keys, so they are not in the repository. A fresh
`git worktree` does not have them; the runner detects a worktree and prints the exact `cp` from the
main checkout for each one it needs. It never copies them itself, and never prints their content:
react-native-config's iOS build step prints every env value it read (`read dotenv {…}`), and the
runner redacts that line before it reaches `build.log`. A leftover `/tmp/envfile` — which
react-native-config reads before `ENVFILE` — stops an iOS run in preflight.

**Dependencies.** A fresh worktree also has no `node_modules`; the runner says to `yarn install`. In
an agent's shell that install's postinstall fails at `pod-install` with "Unicode Normalization not
appropriate for ASCII-8BIT" — harmless here, because the runner installs pods itself with a UTF-8
locale — and reformats `apps/mobile/package.json`. Restore that file with `git checkout` only when
the reformat is the whole diff; an edit of your own there would go with it.

| File                                                    | Needed for                  |
| ------------------------------------------------------- | --------------------------- |
| `apps/mobile/.env`                                      | both                        |
| `apps/mobile/.env.dev`                                  | both                        |
| `apps/web/.env`                                         | `--web local` (the default) |
| `apps/mobile/ios/Firebase/GoogleService-Info-Dev.plist` | iOS                         |
| `apps/mobile/android/app/src/dev/google-services.json`  | Android                     |

## How a run works

### The build reads a derived env file

The harness build does not read `apps/mobile/.env` as it is. It derives one: `.env.dev`'s values (a
dev build needs the Google web client ID, or the Android app dies at module load with an error that
looks like an import cycle), `.env`'s non-empty values over them, and `VITE_WEBVIEW_BASE_URL` pointed
at the harness's own web port. The derived file is written owner-only under the harness's cache
directory (below), outside the checkout, and passed as an absolute `ENVFILE`; react-native-config
accepts that on both platforms. With `--web dev` it is `.env.dev` unchanged.

### Ports

Other sessions hold the defaults — 5003 for the web, 8081 for Metro — more often than not, and a held
default is worse than a refused one: the app quietly loads another checkout's web. The harness
never uses the defaults and never stops a process that holds a port. It picks free ports from its own
ranges (web 5100–5199, Metro 8100–8199) and remembers them per checkout, because both end up inside
the native build: the web URL through the env file, the Metro port as a build setting (React-Core
compiles `RCT_METRO_PORT` in on iOS; `reactNativeDevServerPort` on Android). A remembered port that
someone else took since means a new port and a rebuild.

On Android the emulator's `localhost` is not the host's, so the runner `adb reverse`s both ports.

### Build or reuse

A native build takes minutes, and most changes are web or React Native JavaScript, which vite and
Metro serve live. The runner rebuilds only when a fingerprint of the native inputs changed: the
committed and uncommitted state of `apps/mobile/ios`, `apps/mobile/android`,
`apps/mobile/package.json` and `yarn.lock`, the Firebase file, the derived env file and the Metro
port. `--rebuild` forces one.

- **iOS** builds `-scheme "Chatic Dev" -configuration "Debug Dev"` with `xcodebuild` — the same
  configuration as the `mobile:ios:*:dev` scripts — into a derived-data folder private to the checkout,
  and with `TMPDIR` private to the checkout too: react-native-static-server keeps a CMake cache in
  `$TMPDIR/rnss-build-…`, and another checkout's cache there fails the build with "source does not
  match the source used to generate cache". `pod install` runs only when the Podfile, its lockfile or
  `yarn.lock` changed since the last install.
- **Android** builds `assembleDevDebug` with Gradle directly, for one ABI, and installs with
  `adb -s <serial>`. Not `react-native run-android`: without an explicit device it installs on every
  connected device, and other sessions keep emulators connected. Before installing it compares
  versionCodes; the harness emulator is shared by every checkout, and one on an older branch would
  otherwise fail with `INSTALL_FAILED_VERSION_DOWNGRADE`, so it uninstalls first.

### Its own devices

The harness owns one simulator, `DoU Verify` (iPhone 17 Pro, newest iOS 26 runtime), and one AVD,
`DoU_Verify` (newest arm64 Google APIs image at API 29+), creating each on first use. Other sessions
boot and install onto the stock devices — one once launched its own probe app on a simulator someone
was testing — and a device nobody else picks by name cannot be shared by accident. Every `simctl` and
`adb` call names the UDID or serial. `DOU_VERIFY_AVD=<name>` uses an existing AVD instead; that one
is treated as anybody's — the runner waits while it is already running rather than adopting it, and
only stops it if the runner itself started it.

The Android APK is copied into the harness's own folder after each build and installed from there:
Gradle writes where every devDebug build writes (`yarn mobile:android:dev` included), and reusing
that file could install a build made for other ports.

On its own AVD the runner turns off the OS error dialogs (`hide_error_dialogs`): on a loaded
machine a cold-booted emulator's System UI stalls, and its "isn't responding" dialog covered the app
until someone tapped Wait. An app crash still fails the scenario — the app is gone.

The AVD is created without `avdmanager`, which only exists with the separate command-line tools
package: the runner writes `~/.android/avd/DoU_Verify.ini` and its `config.ini` itself.

### One run at a time

A full native build saturates a laptop. An iOS build beside an Android build and emulator, with vite
and Metro next to them, has restarted one — and with it every session on the machine. So the runner
holds a machine-wide lock (`~/.cache/dou-device-verify/lock`) for the whole run, and before taking it
waits while it sees heavy work the lock cannot: an `xcodebuild`, a Gradle build, or an emulator it did
not start. It prints what it is waiting for, with the process and the folder it runs in, and gives up
with exit 2 after `--wait` minutes. It never stops another session's process. An
`xcodebuild test-without-building` is not counted: that is the XCUITest driver Maestro and Appium keep
open for a whole session — a simulator in use, not a build. Not every session goes through the lock,
so an emulator someone starts after the run has begun still shares the machine; a cold boot then
slows down a lot, and the runner allows it 10 minutes.

Whatever device the runner boots it also shuts down — registered before the boot starts, so a boot
that times out or a Ctrl-C mid-boot does not leave a simulator or emulator running. That includes
the harness's own simulator or AVD found already running (left by an earlier `--keep-device`), which
it adopts. A closed terminal (SIGHUP) or a crash in the runner runs the same cleanup, and a build or
scenario tool still running is stopped first. Only `kill -9` skips it.

### The tree is left as found

`pod install` rewrites `apps/mobile/ios/Podfile.lock` (an environment-specific hermes-engine
checksum), and between runs Xcode's "Check Pods Manifest.lock" phase would refuse the committed
lockfile against the installed Pods — so for the length of a build the runner puts the installed
`Manifest.lock` in its place. `project.pbxproj` is guarded the same way, because `pod install` can
rewrite it too.

The runner snapshots those two files' bytes before the build and writes the same bytes back **as
soon as the build is done** — so a developer's own uncommitted edit to one of them from before the
run survives, and anything edited while a scenario runs or `--app-only` holds the app up is left
alone. It never deletes a file; whatever appeared in the tree during the run is listed at the end.

### The agent's shell

An agent's shell does not source the user's shell profile, so it has no UTF-8 locale (CocoaPods dies
with "Unicode Normalization not appropriate for ASCII-8BIT") and no `ANDROID_HOME` (Gradle: "SDK
location not found"). The runner sets `LANG`/`LC_ALL` to `en_US.UTF-8` and `ANDROID_HOME` (from `ANDROID_SDK_ROOT` when that is set, else `~/Library/Android/sdk`) for everything it starts.

### Where it keeps things

`~/.cache/dou-device-verify/`: the lock, and per checkout the iOS derived data, the private
`TMPDIR`, the derived env file and `state.json` (remembered ports, build fingerprints). Deleting a
checkout's folder there costs one cold build.

## Scenarios

```
apps/mobile/e2e/
  flows/<feature>/<scenario>.yaml   one scenario
  flows/_shared/<step>.yaml         sub-flows scenarios include (never run on their own)
  fixtures/dev-account.json         the fictional number for the dev sign-in
```

**A feature folder is named exactly like its folder in `apps/web/src/app/features`** — the name is
how "you changed `features/home`" turns into "run the `home` scenarios". The runner refuses a folder
that names no web feature, and so does its unit test.

**Tags.** `smoke` marks the few cheap scenarios worth running nightly or before a release
(`--tag smoke`); everything else runs on demand.

**Checkpoints.** A step whose correctness needs eyes — an animation, a layout, a keyboard covering
something — takes a screenshot named `checkpoint-<what>`. The runner lists them at the end; the
procedure says how to judge them. A scenario's pass means its assertions held, not that the
checkpoints look right.

### Writing one

Scenarios are [Maestro](https://maestro.mobile.dev) flows, pinned to the version in
`scripts/mobile-verify/adapters/maestro.js`. Install it from its own installer — the Homebrew formula
called `maestro` is an unrelated app:

```bash
curl -fsSL "https://get.maestro.mobile.dev" | MAESTRO_VERSION=2.11.0 bash
```

The runner passes these variables; a flow reads them as `${NAME}`:

| Variable         | Value                                                 |
| ---------------- | ----------------------------------------------------- |
| `APP_ID`         | `io.chatic.dou.dev` (iOS bundle ID / Android app ID)  |
| `APP_SCHEME`     | `chatic-dev` — the dev build's deep-link scheme       |
| `PLATFORM`       | `ios` or `android`                                    |
| `DOU_TEST_PHONE` | the fixture's fictional number, or `DOU_VERIFY_PHONE` |

Selectors are the text the user reads. The app's screens are web content, and both platforms expose
WebView text through the accessibility tree, so `tapOn: "Chat Rooms"` reaches a web element;
DOM ids and `data-testid` do not cross that boundary. Text is a regular expression matched against
the whole label: a row read as "MY Self Chat" needs `'.*Self Chat'`, and `(`, `)`, `+` need a
backslash. The text is the `en` locale's, and the phone field's country code starts at +1. The
runner sets its own simulator to `en_US` at every boot (a simulator takes the Mac's region when it
is created), and a new AVD starts in en-US; when the device it runs on is anything else — a
`DOU_VERIFY_AVD` in another language — it says so. `maestro --device <id> hierarchy`
prints what a selector can see.

Things that cost a run each until they were known:

- **Wait for the screen, then decide — and do not decide once.** A conditional (`runFlow: when:
visible`) checked before the web has loaded sees nothing, and the Android debug build loads the
  web much later than iOS. A screen can also blink while the boot route settles (onboarding does);
  `repeat` with `while: notVisible: <the next screen>` around an optional tap rides that out.
- **A dev build's LogBox banner covers the bottom of the screen**, the tab bar included, and takes
  taps meant for it. Reach a screen by deep link rather than through the tab bar.
- **`hideKeyboard` cannot close a WebView's keyboard on iOS**; tap static text instead. With the
  keyboard up, the next tap only dismisses it.
- **A toast may be gone before an assertion reads it**; wait for something that stays.
- **A checkbox's state is assertable on iOS only** — `extendedWaitUntil: { visible: { text: …,
checked: true } }`. Android's WebView reports a web checkbox as unchecked to Maestro whatever its
  state, with either hierarchy mode, so on Android a step like that needs a checkpoint screenshot
  instead (`runFlow: when: platform: iOS` keeps the assertion on the platform that supports it).

A deep link reaches a screen directly: `openLink: ${APP_SCHEME}://<path>`, two slashes, the path's
first segment straight after them — `chatic-dev://mypage/login` opens `/mypage/login` (the shell
reads the scheme as the web origin; three slashes give `//mypage/login`, which routes nowhere). The
first link opened from outside the app can raise the OS "Open in …?" alert; tap it away
(`tapOn: { text: "Open", optional: true }`).

A scenario that tests an OS permission prompt sets `launchApp`'s `permissions` itself — the shared
`fresh-guest` launch allows everything, so no prompt appears.

**Dev sign-in.** A guest cold boot needs no account. A scenario that needs one runs
`_shared/dev-sign-in.yaml` (as `mypage/dev-sign-in` does), which uses the dev backend's test path:
the login screen by deep link, the fixture's fictional number, "Skip delivery (dryRun)" and "Receive
via Slack" — on iOS each is asserted checked before anything is requested; on Android, where that
cannot be read, the `checkpoint-dev-switches` screenshot shows them — "Send code", then "Skip the code
(#)". No SMS is sent and no code is typed (were both Android taps to miss, one SMS attempt would go to
the fixture's fictional, unassigned number); the guest becomes a new phone-verified account
(`User_0123` for the fixture). The fixture's number sits in the North American 555-01xx block
reserved for fiction. Never commit a real one. It is one account on the shared dev backend for
everyone who runs the harness: a scenario must not depend on that account's state, and one that
changes it (a profile, a cloud) should use its own number through `DOU_VERIFY_PHONE`.

### Adding a tool

The runner reaches the tool through one adapter (`scripts/mobile-verify/adapters/`): a file
extension, a tag reader, a preflight, and `run()` given a booted device with the app installed. The
runner owns the machine; the adapter owns the scenario files. Changing the tool is a new adapter and
new flow files, not a new runner.

## Limits

- **Simulators and emulators only**, like [local-run.md](./local-run.md). A physical device needs a
  dev build, which is a different road.
- **A simulator pass is not proof for a compositor or WebKit-on-device bug.** A WebKit
  `backdrop-filter` black flash seen on iPhones did not reproduce on the simulator at all. Say which
  one was checked.
- The simulator cannot decode remote video frames, and `simctl push` skips the notification service
  extension; push and media behaviour belongs on a device.

## Tests

CI does not run these: `verify.yml` covers Nx projects, and `scripts/` is not one. Run them by hand
when changing the runner.

The runner's pure parts (argument parsing, scenario selection, the lock, port choice, the env merge,
the fingerprint, the tree-guard parsing, the Maestro adapter's parsing) are covered by
`scripts/__tests__/mobile-verify.test.js`:

```bash
yarn mobile:version:test    # runs every scripts/__tests__ suite
```

The device paths are covered by running it.
