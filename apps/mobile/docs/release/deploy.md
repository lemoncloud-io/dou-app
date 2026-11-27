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

# Upload the platforms a tag is missing, at that tag's version and build number
git switch --detach mobile-v0.33.0-100
yarn mobile:release dev --tag mobile-v0.33.0-100

# Re-run only the finish step (release, card, PR comments) for a tag already pushed
yarn mobile:release finish mobile-v0.33.0-100

# Tags and the latest runs of both workflows
yarn mobile:release status
```

`dev` runs these steps and stops at the first failure:

1. **Preflight.** On `develop`, a clean tree, `HEAD` equal to `origin/develop`, the deploy keys this run
   needs ([Keys](#keys)), fastlane installed, no remote run in progress and store notes of 1–500
   characters. `--dry-run` prints every check, the plan and the commands below, then stops before it
   reads the stores or uploads anything.
2. **Store build numbers.** `fastlane <platform> latest_build env:dev` reads the latest build number of
   each platform's dev app. A store that cannot be read stops the run.
3. **Plan.** Version, build number and team notes ([Version and build number](#version-and-build-number)).
   `--bump` and `--version` override the proposal, `--build` the build number, and `--team-notes-file`
   the generated notes. A computed tag that already exists stops the run.
4. **Upload.** `scripts/deploy-mobile.sh <platform> dev -m <store notes>` for iOS, then Android, with
   `VERSION_NAME` and `BUILD_NUMBER` set. A failed platform stops the next one.
5. **Tag.** When at least one platform reached the store, an annotated `mobile-v<version>-<build>` tag
   on the built commit, pushed to `origin`. Its message records the environment, the result of each
   platform and the store notes.
6. **Finish.** `gh workflow run mobile-release-finish.yml -f tag=<tag>` ([GitHub release](#github-release)).
   The channel's webhook secrets live only in GitHub, so the card is posted from there.

### Prod

A prod upload ships a build that already reached the dev app: it takes that build's tag and never
computes a version or build number of its own.

```bash
git switch --detach mobile-v0.33.0-121
yarn mobile:release prod all --tag mobile-v0.33.0-121 --dry-run
yarn mobile:release prod all --tag mobile-v0.33.0-121     # store notes default to the tag's
```

1. **Dev record.** The tag must be a dev build tag whose GitHub release has a dev row, and every
   platform asked for must have reached the dev app at that tag. Anything else is refused.
2. **Preflight.** `HEAD` at the tag's commit, a clean tree, the prod keys, fastlane, no remote run.
3. **Release branch.** `release/mobile-<major>.<minor>` for the tag's version. If it exists, the tag's
   commit must be on it, or the run stops. If not, it is created at the tag's commit after the upload.
4. **Prod store floor.** The latest build of each prod store app is read; unless every one is below the
   tag's build number, the run stops. A dry run does not read the stores.
5. **Upload** with the tag's `VERSION_NAME` and `BUILD_NUMBER`, iOS first, recording each result.
   Platforms the release already shows as shipped to prod are skipped, so running `prod` again uploads
   only what is missing and merges the results.
6. **Finish** with `env=prod`: the release turns from pre-release into a full release, still with
   `--latest=false`; its table gains a prod row; each included pull request gets "Shipped in prod …".

`--submit` (and the `submit` input) is refused: store review submission comes with store automation,
after the App Store and Play release settings change.

### Hotfix

1. Merge the fix into `develop`.
2. Cherry-pick it onto `release/mobile-<major>.<minor>` by hand and push the branch.
3. On that branch, `yarn mobile:release dev`: a release-branch build is always a patch of the last
   `mobile-v<major>.<minor>.*` tag on the branch (`--bump` other than `patch` and `--version` are
   refused). The dev app runs the release branch's code until the next `develop` build, and the
   channel card says so.
4. After checking it in the dev app, run `prod` with that build's tag.

Each platform ends with one of these results, recorded in the tag message and the release:

| Result       | Meaning                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------- |
| `uploaded`   | the lane exited 0                                                                             |
| `incomplete` | the lane failed, but the store's latest build is this build: the binary is there, check notes |
| `failed`     | the lane failed and the build is not in the store                                             |
| `skipped`    | an earlier platform failed, so this one was not tried                                         |

`uploaded` and `incomplete` both hold the build number, so either gets the build tagged. The iOS lane
waits for TestFlight processing before it sets the notes; a failure in that wait is `incomplete`, and
"What to Test" may need setting by hand. To upload a `failed` or `skipped` platform later, check out the
tag and run `dev --tag <tag>`: it builds that commit at the tag's version and build number, uploads only
the platforms the tag lacks, and runs the finish step with the merged results. The tag is never moved;
the release table is what changes.

Two runs, one on a Mac and one remote, could take the same build number; the store rejects the later
upload, and running it again takes the next number. The preflight's remote-run check is there to avoid
it, and `dev` fetches the `mobile-v*` tags again before each upload and before tagging. If a tag at or
above its build number appeared, it stops without tagging and says which platforms it uploaded. The
number is not reused — the other run's tag holds it, and the next run reads the store — but that upload
has no release of its own; add a line about it to the other tag's GitHub release.

### Keys

The local path reads these files in the working tree. They are gitignored; get them from the team
secrets repository, which keeps them at the same paths. A run checks only the files it needs:

| Run                     | Files                                                           |
| ----------------------- | --------------------------------------------------------------- |
| iOS upload, dev or prod | `.env`, `AuthKey_*.p8`                                          |
| Android upload, dev     | `.env`, `play-service-account-dev.json`, `chatic-dou.keystore`  |
| Android upload, prod    | `.env`, `play-service-account-prod.json`, `chatic-dou.keystore` |

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

The previous flow still works as an emergency path. It commits the version. Do not use it once a
`mobile-v*` tag exists: it ships the `versionCode` from `build.gradle`, which collides with the
tag-numbered builds already in the stores. Dev goes through `yarn mobile:release dev` and prod through
`yarn mobile:release prod`.

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

| Input         | Meaning                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `env`         | `dev`, or `prod` with `tag`: the dev build to ship ([Prod](#prod))                              |
| `platform`    | `all`, `ios` or `android`. iOS goes first; a failed platform stops the next one                 |
| `ref`         | `develop`, or `release/mobile-<major>.<minor>` for a hotfix build (always patch)                |
| `bump`        | `auto` takes the proposal; `patch`, `minor` or `major` overrides it                             |
| `version`     | `X.Y.Z` to set the version by hand; it must be higher than the last prod version                |
| `build`       | build number by hand; it must not be lower than the next free one                               |
| `tag`         | `env=prod`: the build to ship. `env=dev`: upload the platforms that tag lacks, like `dev --tag` |
| `submit`      | must stay `false` until store review submission is automated                                    |
| `store_notes` | TestFlight "What to Test" and the Play release notes. Empty or over 500 characters fails first  |
| `team_notes`  | English notes for the release and the card. Empty regenerates them the way `plan` does          |

The runner reads the store build numbers after restoring the keys and before planning, as a local run
does, and records each platform's result the same way. A prod run cuts the release branch in a
separate job with write access, after the upload. `action` (`release`, `rollout`, `halt`) and
`rollout` are declared for store submission; the preflight job refuses them for now. One remote run at a time: a second run
waits in the `mobile-release` concurrency group. The workflow only has a `workflow_dispatch` trigger —
the repository is public, and a fork's pull request must never reach these secrets. Until the iOS
signing method for a runner is decided, run `platform=android` here and upload iOS from a Mac.

## Version and build number

- **Tag**: `mobile-v<version>-<build>`, for example `mobile-v0.33.0-100`, annotated, on the built
  commit, made only after an upload succeeded, and never moved. The `mobile-` prefix keeps these apart
  from the desktop releases' tags; everything here reads `mobile-v*` tags only.
- **Build number**: one more than the highest of the `mobile-v*` tags' builds, the latest build in the
  store apps this run uploads to, and the `versionCode` in `build.gradle`. iOS and Android share it.
  The store is read because a run can put a binary in the store and fail before it tags. `--build`
  (or the `build` input) sets the number by hand; it must not be lower than the computed one.
- **Base version**: the last prod release's version; before the first prod tag, the `versionName` in
  `build.gradle`.
- **Bump**, proposed from what reached the binary since the base (labels are not used):

    | Proposed | When                                                                                    |
    | -------- | --------------------------------------------------------------------------------------- |
    | major    | a commit has `!` after the type, or `BREAKING CHANGE:` in the body. `auto` ships minor  |
    | minor    | a new `*.m`, `*.mm` or `*.swift` file under `ios/`, or `*Package.kt` under `android/`   |
    | minor    | a new `dependencies` entry in `apps/mobile/package.json`, or a changed `Podfile.lock`   |
    | minor    | a new `uses-permission` in `AndroidManifest.xml` or `*UsageDescription` in `Info.plist` |
    | patch    | anything else, including `feat` commits with no native signal                           |

    Build configuration — `build.gradle`, `gradle.properties`, `settings.gradle`, ProGuard rules,
    `project.pbxproj`, `*.xcconfig`, the Fastfile — is not a signal. Over the sixty days before this rule,
    it matched the bump people chose in 21 of 23 releases; a `feat`-based rule matched 8.

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
whose root is `apps/mobile`, nested libraries included). Markdown, `docs/`, tests (`__tests__/`,
`*.test.*`, `*.spec.*`, `src/test/`), stories, `apps/mobile/e2e/`, `apps/mobile/fastlane/`, Nx, Jest and
ESLint configuration and `.gitignore` do not count, and neither do the old `bump app versions`
commits. A library nested inside a dependency's folder counts only when `mobile` depends on it too.

Team notes cover the commits since the last `mobile-v*` tag on the branch. Each commit's pull request
comes from `GET /repos/{owner}/{repo}/commits/{sha}/pulls`; a pull request takes the highest type
among its counted commits and is listed once, under `Breaking`, `Features`, `Fixes`, `Improvements` or
`Other`. The DoU channel card carries the same list under Korean headings.
Author names go through the `replacers` of `.github/release-drafter.yml`.

## GitHub release

Titled `DoU Mobile <version> (<build>)`, a pre-release while the build has only reached the dev app
and a full release once it reaches prod, always created and edited with `--latest=false`: the repository's Latest release is the desktop prod
build, and a mobile release taking it would change where desktop downloads point. The body holds the
upload table (a dev row and, once shipped, a prod row: time, the result for iOS and for Android, who
ran it, the run), the team notes, the store notes, the
bump and its reason, the commit and a link to the changes since the previous tag.

`.github/workflows/mobile-release-finish.yml` writes it on a Linux runner, for a tag that is already
on `origin`: it rebuilds the plan for that tag (the commits since the tag before it), creates or edits
the release, comments once on each included pull request ("Shipped in dev 0.33.0 (100)", then
"Shipped in prod …") and posts the DoU card, marked `[prod]` for prod and with the branch for a
release-branch build. It runs by `workflow_dispatch` from a local run and by `workflow_call` from the remote one,
with the same inputs (`tag`, `env`, `platform` — the result per platform, such as
`ios=uploaded,android=failed` — `store_notes`, `team_notes`); each defaults to what the tag message
records, so `yarn mobile:release finish <tag>` needs only the tag. A prod finish keeps the dev row
from the existing release and needs the prod results the first time
(`finish <tag> --env prod --results ios=uploaded,android=uploaded`); later it reuses the prod row.

If the upload succeeded but the finish step failed, run only the finish step again. Never upload a
platform again that the tag records as `uploaded` or `incomplete`: the store already holds that build
number. A platform recorded as `failed` or `skipped` goes up with `dev --tag <tag>`, or for prod with
`prod <platform> --tag <tag>`.

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

| File                                          | Role                                                                                                                                                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/version-mobile.js`                   | version bump. Treats Android `build.gradle` as the single source of truth and aborts if iOS has drifted from it. Test: `yarn mobile:version:test`                                                   |
| `scripts/deploy-mobile.sh`                    | deploy entry point — collects the release message, then dispatches the fastlane lane                                                                                                                |
| `scripts/mobile-release/`                     | `yarn mobile:release`: `plan`, `dev`, `prod`, `finish`, `status` on a Mac; `finish.js` inside the finish workflow; `ios-version` for the Fastfile. Test: `scripts/__tests__/mobile-release.test.js` |
| `.github/workflows/mobile-release.yml`        | the remote path: preflight, upload on macOS, tag, then the finish workflow                                                                                                                          |
| `.github/workflows/mobile-release-finish.yml` | GitHub release, PR comments and DoU card for a pushed tag (Linux)                                                                                                                                   |
| `apps/mobile/fastlane/Fastfile`               | four upload lanes (`ios dev\|prod`, `android dev\|prod`) and `latest_build` per platform, which reads the store's latest build number                                                               |
| `apps/mobile/fastlane/.env`                   | credentials (gitignored); template at `.env.example`                                                                                                                                                |

## Troubleshooting

- **iOS signing failure** — the project uses Automatic signing; the lane refreshes signing assets
  itself with `-allowProvisioningUpdates` and the ASC API key. If it still fails, open the scheme once
  in Xcode to check its signing status.
- **Play upload 403** — check Play Console → Setup → API access that the service account is invited
  to that package (the dev app especially).
- **Version-mismatch error** — `version-mobile.js` aborts with "out of sync" when one platform was
  edited by hand. Align both files' version fields manually, then retry.
