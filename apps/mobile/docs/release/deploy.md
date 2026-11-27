# Deploy

Builds and uploads the mobile app (iOS/Android × dev/prod, four store apps total) to the stores. One
codebase, two ways to run it: `yarn mobile:release` on a Mac (the default, [Release](#release)) and
the `mobile-release` workflow on a GitHub-hosted macOS runner ([Remote release](#remote-release)).
Both hand the build to the same finish workflow, which writes the GitHub release, posts the DoU card
and comments on the pull requests. Only the upload is automated — submitting for review or releasing
is a human decision made in App Store Connect / Play Console.

## Targets

| App          | Identifier          | Channel              |
| ------------ | ------------------- | -------------------- |
| iOS dev      | `io.chatic.dou.dev` | TestFlight (dev app) |
| iOS prod     | `io.chatic.dou`     | TestFlight           |
| Android dev  | `io.chatic.dou.dev` | Play closed testing  |
| Android prod | `io.chatic.dou`     | Play internal track  |

## One-time setup

1. **Install fastlane** — `brew install fastlane` (Homebrew's fastlane bundles its own Ruby, so the
   system Ruby version does not matter).
2. **Place credentials** in `apps/mobile/fastlane/` (both `.p8` and `.json` are gitignored there, so
   nothing is committed). The team secrets repository holds all of them at these paths ([Keys](#keys)):
    - an App Store Connect API key: the `.p8` file, its Key ID and Issuer ID
    - **two** Play Console service-account JSON files — Android dev and prod live in different Google
      Cloud accounts, so both `PLAY_JSON_KEY_PATH` and `PLAY_JSON_KEY_PATH_DEV` are needed
    - the Android release keystore (`chatic-dou.keystore`) and its password
3. **Write `.env`** — copy `apps/mobile/fastlane/.env.example` to `.env` and fill it in.
    - A key-file path that is just a filename resolves against `fastlane/`; absolute paths and `~`
      also work.
    - Set the `*_DEV` variables only when the dev app uses a separate Apple account — left empty, dev
      deploys fall back to the shared values.
    - Adjust `PLAY_TRACK_DEV` if the Play closed-testing track is not named `alpha` in the console.
4. **Give the app's env files the runtime's service settings** (from 0.32.0). The app can hold the
   session itself ([runtime](../runtime/README.md)), and its runtime reads the same services the web
   build of that stage does: `VITE_PROJECT`, `VITE_HOST`, `VITE_OAUTH_ENDPOINT`,
   `VITE_SOCIAL_OAUTH_ENDPOINT`, `VITE_BACKEND_ENDPOINT`, `VITE_DOU_ENDPOINT` and `VITE_WS_ENDPOINT`,
   copied from `apps/web/.env.dev` into `apps/mobile/.env.dev` and from `apps/web/.env.prod` into
   `apps/mobile/.env.prod`. A build without them still works: the runtime cannot start, every launch
   stays the page's, and the debug overlay's Session owner screen shows **This page** as the page's own
   session even after the switch. A dev build needs them most: it starts every install nobody switched
   on the runtime ([runtime](../runtime/README.md#who-owns-the-session)), so a dev build without them
   tries the runtime on every launch and falls back to the page each time.

## Release

There is no version-bump pull request and no release pull request: the version comes from tags and is
never committed. Every upload leaves a `mobile-v<version>-<build>` tag, a GitHub release, a DoU channel
card and a comment on every pull request the build includes.

```bash
# What the next build would be: base version, proposed bump and why, build number, team notes
yarn mobile:release plan
yarn mobile:release plan --json      # the same, as a script reads it

# Upload to the dev apps from develop. Store notes are required: English, at most 500 characters.
yarn mobile:release dev android --notes "Fixes the chat image upload on Android." --dry-run
yarn mobile:release dev all --notes-file store-notes.txt

# Re-run only the finish step (release, card, PR comments) for a tag already pushed
yarn mobile:release finish mobile-v0.33.0-100

# Tags and the latest runs of both workflows
yarn mobile:release status
```

`dev` runs these steps and stops at the first failure:

1. **Preflight.** On `develop`, a clean tree, `HEAD` equal to `origin/develop`, the five deploy keys
   present ([Keys](#keys)), fastlane installed, no remote run in progress, store notes 1–500
   characters, and the computed tag not taken. `--dry-run` prints every check, the plan and the
   commands below, then stops before any upload.
2. **Plan.** Version, build number and team notes ([Version and build number](#version-and-build-number)).
   `--bump` and `--version` override the proposal; `--team-notes-file` replaces the generated notes.
3. **Upload.** `scripts/deploy-mobile.sh <platform> dev -m <store notes>` for iOS, then Android, with
   `VERSION_NAME` and `BUILD_NUMBER` set. A failed platform stops the next one.
4. **Tag.** An annotated `mobile-v<version>-<build>` tag on the built commit, pushed to `origin`. Its
   message records the environment, the platforms that uploaded and the store notes.
5. **Finish.** `gh workflow run mobile-release-finish.yml -f tag=<tag>` ([GitHub release](#github-release)).
   The channel's webhook secrets live only in GitHub, so the card is posted from there.

`prod` is refused until prod uploads arrive with release branches; prod still goes through
`yarn mobile:deploy:prod` ([Without the release command](#without-the-release-command)).

Two runs, one on a Mac and one remote, could take the same build number; the store rejects the later
upload, and running it again takes the next number. The preflight's remote-run check is there to avoid
it, and `dev` fetches the `mobile-v*` tags again before each upload and before tagging. If a tag at or
above its build number appeared, it stops without tagging and says which platforms it uploaded. The
number is not reused — the other run's tag holds it — but that upload has no release of its own; add a
line about it to the other tag's GitHub release.

A platform counts as uploaded only when its fastlane lane exits 0. The iOS lane waits for TestFlight to
finish processing before it sets the notes, so a failure or a cancel in that wait leaves a build in
TestFlight that no tag records, and the next run takes the same number and is rejected. Check
TestFlight before running again after an iOS failure late in the lane.

### Keys

The local path reads five files at these paths in the working tree. They are gitignored; get them from
the team secrets repository, which keeps them at the same paths.

| Path                                                  | What                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `apps/mobile/fastlane/.env`                           | key IDs, keystore passwords, Play tracks; key paths are bare filenames  |
| `apps/mobile/fastlane/AuthKey_*.p8`                   | App Store Connect API key                                               |
| `apps/mobile/fastlane/play-service-account-dev.json`  | Play service account of the dev app                                     |
| `apps/mobile/fastlane/play-service-account-prod.json` | Play service account of the prod app (a different Google Cloud account) |
| `apps/mobile/android/app/chatic-dou.keystore`         | Android upload keystore                                                 |

Anyone holding these files can upload to the dev and prod store apps. iOS also needs the Mac to sign
for the Apple team: the lane signs automatically with the App Store Connect API key and
`-allowProvisioningUpdates`, and how a second team member's Mac gets the distribution certificate is
not decided yet. Android needs nothing beyond the keystore.

### Without the release command

The previous flow still works and is what prod uses for now. It commits the version. Do not use it for
dev once a `mobile-v*` tag exists: it ships the `versionCode` from `build.gradle`, which collides with
the tag-numbered builds already in the dev apps. Dev goes through `yarn mobile:release dev`.

```bash
yarn mobile:version patch          # major | minor | patch | build — edits build.gradle and pbxproj, commits
yarn mobile:deploy:dev -m "fix chat image upload bug"
yarn mobile:deploy:prod -m "0.19.1 stability improvements"
yarn mobile:deploy:ios:dev -m "..."     # one platform only
```

- The release notes become TestFlight's "What to Test" and the Play release notes (`PLAY_LOCALE`,
  default `en-US`); write them in English.
- A store rejects a re-upload of the same build number (`versionCode`/`CFBundleVersion`).
- iOS deploy waits for build processing to finish before it can apply the changelog (can take minutes
  to tens of minutes).
- iOS deploy then uploads the archive's dSYMs to Crashlytics. With bitcode off, the archived binary
  is the one the store ships and App Store Connect generates no dSYMs of its own, so there is
  nothing to fetch back from it. A failed symbol upload is logged with a retry command and does not
  fail the deploy — the build is already on TestFlight by then.

## Remote release

`.github/workflows/mobile-release.yml` runs the same steps on a GitHub-hosted macOS runner, with the
keys restored from environment secrets ([Remote secrets](#remote-secrets)), and calls the finish
workflow as its last job.

```bash
gh workflow run mobile-release.yml -f env=dev -f platform=android -f bump=auto \
  -f store_notes="Fixes the chat image upload on Android."
```

| Input         | Meaning                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `env`         | `dev` today. `prod` is refused until prod uploads move here                                    |
| `platform`    | `all`, `ios` or `android`. iOS goes first; a failed platform stops the next one                |
| `ref`         | branch to build, `develop`                                                                     |
| `bump`        | `auto` takes the proposal; `patch`, `minor` or `major` overrides it                            |
| `version`     | `X.Y.Z` to set the version by hand; it must be higher than the last prod version               |
| `store_notes` | TestFlight "What to Test" and the Play release notes. Empty or over 500 characters fails first |
| `team_notes`  | Korean notes for the release and the card. Empty regenerates them the way `plan` does          |

`action` (`release`, `rollout`, `halt`), `tag`, `submit` and `rollout` are declared for store
submission and prod; the preflight job refuses them for now. One remote run at a time: a second run
waits in the `mobile-release` concurrency group. The workflow only has a `workflow_dispatch` trigger —
the repository is public, and a fork's pull request must never reach these secrets. Until the iOS
signing method for a runner is decided, run `platform=android` here and upload iOS from a Mac.

## Version and build number

- **Tag**: `mobile-v<version>-<build>`, for example `mobile-v0.33.0-100`, annotated, on the built
  commit, made only after an upload succeeded, and never moved. The `mobile-` prefix keeps these apart
  from the desktop releases' tags; everything here reads `mobile-v*` tags only.
- **Build number**: the highest build of all `mobile-v*` tags plus one; before the first tag, the
  `versionCode` in `build.gradle` plus one. iOS and Android share it.
- **Base version**: the last prod release's version; before the first prod tag, the `versionName` in
  `build.gradle`.
- **Bump**, proposed from the conventional commit types of the commits that reach the binary since
  the base (labels are not used):

    | Proposed | When any commit has                                                                 |
    | -------- | ----------------------------------------------------------------------------------- |
    | major    | `!` after the type, or `BREAKING CHANGE:` in the body. `auto` still ships minor     |
    | minor    | type `feat`, or a native change: `ios/**`, `android/**`, a new `dependencies` entry |
    | patch    | anything else                                                                       |

- **Proposed version**: the base bumped by that unit, never lower than a dev tag already on the
  branch.
- **Injection**: Android takes `-PversionCode` / `-PversionName` over the values in `build.gradle`;
  iOS has the four app targets in `project.pbxproj` rewritten before the archive and the file put back
  after the upload (the notification extensions keep `1.0 (1)`). The lanes read `VERSION_NAME` and
  `BUILD_NUMBER`; with both unset they ship the file values, which is what a local deploy does.
- **The numbers in `build.gradle` and `project.pbxproj` go stale on purpose.** They are the floor for a
  local build, so a local debug build showing an older version is expected.

## Which commits count

A commit counts when it changes a file that reaches the binary: `apps/mobile/**` or the source of a
library `mobile` depends on in the Nx project graph (`npx nx graph --file=…`, walked from the project
whose root is `apps/mobile`). Markdown, `docs/`, tests, stories, `apps/mobile/e2e/` and
`apps/mobile/fastlane/` do not count, and neither do the old `bump app versions` commits. A web-only
`feat` therefore never makes a minor.

Team notes cover the commits since the last `mobile-v*` tag on the branch. Each commit's pull request
comes from `GET /repos/{owner}/{repo}/commits/{sha}/pulls`; a pull request takes the highest type
among its counted commits and is listed once, under `호환성 변경`, `새 기능`, `수정`, `개선` or `기타`.
Author names go through the `replacers` of `.github/release-drafter.yml`.

## GitHub release

Titled `DoU Mobile <version> (<build>)`, a pre-release while the build has only reached the dev app,
always created and edited with `--latest=false`: the repository's Latest release is the desktop prod
build, and a mobile release taking it would change where desktop downloads point. The body holds the
upload table (environment, time, platforms, who ran it, the run), the team notes, the store notes, the
bump and its reason, the commit and a link to the changes since the previous tag.

`.github/workflows/mobile-release-finish.yml` writes it on a Linux runner, for a tag that is already
on `origin`: it rebuilds the plan for that tag (the commits since the tag before it), creates or edits
the release, comments once on each included pull request and posts the DoU card. Its inputs (`tag`,
`env`, `platform`, `store_notes`, `team_notes`) default to what the tag message records, so
`yarn mobile:release finish <tag>` needs only the tag.

If the upload succeeded but the finish step failed, run only the finish step again. Never upload
again: the store already holds that build number. A run whose first platform uploaded and whose second
failed still tags the build with the platform that made it, so the number is not reused.

## Remote secrets

Two GitHub environments hold the remote path's keys, so a dev run can never reach the prod app's keys: `mobile-dev`
and `mobile-prod`. Both use the same secret names; each holds its own app's values. A job sees them
only when it declares that environment, and only the upload job does.

| Secret                             | Becomes                                                      | What                                                 |
| ---------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| `ASC_KEY_ID`                       | `ASC_KEY_ID`                                                 | App Store Connect API key ID                         |
| `ASC_ISSUER_ID`                    | `ASC_ISSUER_ID`                                              | its issuer ID                                        |
| `ASC_API_KEY_P8_BASE64`            | a `.p8` file, path in `ASC_KEY_PATH`                         | the key itself                                       |
| `PLAY_JSON_KEY_BASE64`             | a JSON file, path in `PLAY_JSON_KEY_PATH`                    | Play service account of this environment's app       |
| `ANDROID_KEYSTORE_BASE64`          | a keystore file, path in `ANDROID_KEYSTORE_FILE`             | the Android upload key (`chatic-dou.keystore`)       |
| `ANDROID_KEYSTORE_PASSWORD`        | `ANDROID_KEYSTORE_PASSWORD`                                  | keystore password                                    |
| `ANDROID_KEY_ALIAS`                | `ANDROID_KEY_ALIAS`                                          | key alias                                            |
| `ANDROID_KEY_PASSWORD`             | `ANDROID_KEY_PASSWORD`                                       | key password                                         |
| `MOBILE_ENV_FILE_BASE64`           | `apps/mobile/.env.dev` or `.env.prod`                        | the app's env file for that stage                    |
| `GOOGLE_SERVICES_JSON_BASE64`      | `android/app/src/<env>/google-services.json`                 | Firebase config, Android                             |
| `GOOGLE_SERVICE_INFO_PLIST_BASE64` | `ios/Firebase/GoogleService-Info-Dev.plist` or `-Prod.plist` | Firebase config, iOS (also used for the dSYM upload) |
| iOS signing                        | —                                                            | not decided yet; see below                           |

The channel card uses the repository secrets `notify-merge.yml` already uses: `DOU_WEBHOOK_URL`,
`DOU_WEBHOOK_TOKEN` and `DOU_CHANNEL_ID`.

The Android dev and prod apps live in different Google Cloud accounts, so `PLAY_JSON_KEY_BASE64`
differs between the two environments. When both apps share one Apple account, the `ASC_*` values are
the same in both. The local `.env` keeps its `*_DEV` variables; CI does not need them because each
environment already holds the right key.

**iOS signing is open.** The lane signs automatically with the App Store Connect API key and
`-allowProvisioningUpdates`, as a local deploy does, and the workflow's iOS signing step is a
placeholder until the team picks how a runner gets the distribution certificate. Until then, run
`platform=android` in CI and upload iOS from a Mac.

### Setting up the environments

A repository admin does this once. Nothing here is done by an agent, and secret values never go into
the repository, an issue or a chat.

1. Create the environments, limited to the default branch:

    ```bash
    for e in mobile-dev mobile-prod; do
      gh api -X PUT "repos/lemoncloud-io/dou-app/environments/$e" \
        -F 'deployment_branch_policy[protected_branches]=false' \
        -F 'deployment_branch_policy[custom_branch_policies]=true'
      gh api -X POST "repos/lemoncloud-io/dou-app/environments/$e/deployment-branch-policies" -f name=develop
    done
    ```

    For `mobile-prod`, also add required reviewers in Settings → Environments.

2. Set each secret in each environment. `gh secret set` reads the value from standard input, so the
   value stays out of the shell history:

    ```bash
    E=mobile-dev   # then again with E=mobile-prod and that app's values
    gh secret set ASC_KEY_ID --env "$E"
    gh secret set ASC_ISSUER_ID --env "$E"
    base64 -i AuthKey_XXXXXXXX.p8 | gh secret set ASC_API_KEY_P8_BASE64 --env "$E"
    base64 -i play-service-account-dev.json | gh secret set PLAY_JSON_KEY_BASE64 --env "$E"
    base64 -i chatic-dou.keystore | gh secret set ANDROID_KEYSTORE_BASE64 --env "$E"
    gh secret set ANDROID_KEYSTORE_PASSWORD --env "$E"
    gh secret set ANDROID_KEY_ALIAS --env "$E"
    gh secret set ANDROID_KEY_PASSWORD --env "$E"
    base64 -i apps/mobile/.env.dev | gh secret set MOBILE_ENV_FILE_BASE64 --env "$E"
    base64 -i apps/mobile/android/app/src/dev/google-services.json | gh secret set GOOGLE_SERVICES_JSON_BASE64 --env "$E"
    base64 -i apps/mobile/ios/Firebase/GoogleService-Info-Dev.plist | gh secret set GOOGLE_SERVICE_INFO_PLIST_BASE64 --env "$E"
    ```

3. Check the names landed: `gh secret list --env mobile-dev`.

A missing secret fails the upload job before any build, naming the secret and the environment.

## Android native module linking

The Android build links each native library from a list it caches in
`android/build/generated/autolinking/autolinking.json`, the output of
`npx @react-native-community/cli config`. iOS has no such cache: `pod install` and `Podfile.lock`
carry the list.

The list is rebuilt only when a file it is keyed on changes. React Native's default keys it on the
lockfiles next to `apps/mobile/package.json`, and this monorepo has none there: its lockfile is the
root `yarn.lock`. So a build that ran after a native library was added to `package.json` but before
`yarn install` put it in `node_modules` cached a list without it, and nothing ever refreshed it. The
app then shipped the library's JS without its native module. App 0.32.1 shipped that way: the
runtime's network signal (`@react-native-community/netinfo`) threw `NativeModule.RNCNetInfo is null`
on Android, while iOS was fine.

`android/settings.gradle` therefore names the root `yarn.lock` alongside `package.json` and
`react-native.config.js`, so an install that changes the lockfile rebuilds the list. Deleting
`android/build/generated/autolinking/` forces the same rebuild by hand.

## Android code shrinking (R8)

Release builds run R8, which shrinks and renames the app's Java/Kotlin classes; debug builds do not.
The JS side is unaffected — it already ships as Hermes bytecode. Resource shrinking stays off: the
push service looks up `app_scheme` by name with `getIdentifier`, which is exactly what the resource
shrinker gets wrong.

- **Breakage shows up at runtime, not at build time.** Anything looked up by name — reflection, a
  WebView `@JavascriptInterface`, JNI — fails as `ClassNotFoundException`/`NoSuchMethodException`
  only once that path runs. React Native modules are already kept by react-android's own rules; the
  app-specific exceptions live in `android/app/proguard-rules.pro`, each with its reason. The one
  that matters most is `BuildConfig`: `react-native-config` reads it by reflection, so without the
  rule every `Config` value is empty in release only.
- **Adding a native library or a reflective lookup** means building a release APK and exercising
  that path on an emulator before shipping it. A debug build proves nothing here. To build one
  without the release keystore, inject the debug key:
  `./gradlew assembleDevRelease -x uploadCrashlyticsMappingFileDevRelease -Pandroid.injected.signing.store.file=$PWD/app/debug.keystore -Pandroid.injected.signing.store.password=android -Pandroid.injected.signing.key.alias=androiddebugkey -Pandroid.injected.signing.key.password=android`
  (the `-x` keeps a local test build's mapping out of Crashlytics).
- **R8 does not hide env values.** `react-native-config` writes every key of `.env.dev`/`.env.prod`
  into the APK twice — as a `BuildConfig` field and as a string resource — and R8 only ever touches
  the first. Anything in those files ships with the app, so a value that must stay on the build
  machine does not belong there.
- **Stack traces stay readable.** The Crashlytics gradle plugin uploads the mapping file during the
  release build, and the AAB carries it to Play, so neither console needs a manual upload.

## Components

| File                                          | Role                                                                                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/version-mobile.js`                   | version bump. Treats Android `build.gradle` as the single source of truth and aborts if iOS has drifted from it. Test: `yarn mobile:version:test`                                           |
| `scripts/deploy-mobile.sh`                    | deploy entry point — collects the release message, then dispatches the fastlane lane                                                                                                        |
| `scripts/mobile-release/`                     | `yarn mobile:release`: `plan`, `dev`, `finish`, `status` on a Mac; `finish.js` inside the finish workflow; `ios-version` for the Fastfile. Test: `scripts/__tests__/mobile-release.test.js` |
| `.github/workflows/mobile-release.yml`        | the remote path: preflight, upload on macOS, tag, then the finish workflow                                                                                                                  |
| `.github/workflows/mobile-release-finish.yml` | GitHub release, PR comments and DoU card for a pushed tag (Linux)                                                                                                                           |
| `apps/mobile/fastlane/Fastfile`               | four lanes (`ios dev\|prod`, `android dev\|prod`), each building and uploading                                                                                                              |
| `apps/mobile/fastlane/.env`                   | credentials (gitignored); template at `.env.example`                                                                                                                                        |

## Troubleshooting

- **iOS signing failure** — the project uses Automatic signing; the lane refreshes signing assets
  itself with `-allowProvisioningUpdates` and the ASC API key. If it still fails, open the scheme once
  in Xcode to check its signing status.
- **Play upload 403** — check Play Console → Setup → API access that the service account is invited
  to that package (the dev app especially).
- **Version-mismatch error** — `version-mobile.js` aborts with "out of sync" when one platform was
  edited by hand. Align both files' version fields manually, then retry.
