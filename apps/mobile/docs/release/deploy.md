# Deploy

A local-Mac, one-command pipeline that builds and uploads the mobile app (iOS/Android × dev/prod,
four store apps total) to the stores. Only the upload is automated — submitting for review or
releasing is a human decision made in App Store Connect / Play Console.

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
   nothing is committed):
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

## Deploy flow

```bash
# 1. Bump the version — syncs the 4 iOS (pbxproj) + Android (build.gradle) fields and commits
yarn mobile:version patch          # major | minor | patch
yarn mobile:version build          # re-upload the same version: bump only the build number

# 2. Deploy — collects release notes (prompts if -m is omitted) → build → store upload
yarn mobile:deploy:dev -m "fix chat image upload bug"
yarn mobile:deploy:prod -m "0.19.1 stability improvements"

# One platform only
yarn mobile:deploy:ios:dev -m "..."
yarn mobile:deploy:android:prod -m "..."
```

- The release notes become TestFlight's "What to Test" and the Play release notes (`PLAY_LOCALE`,
  default `en-US`); write them in English.
- A store rejects a re-upload of the same build number (`versionCode`/`CFBundleVersion`), so
  **re-uploading a build that already succeeded** needs `yarn mobile:version build` first — this is
  not a retry-after-failure step.
- iOS deploy waits for build processing to finish before it can apply the changelog (can take minutes
  to tens of minutes).

## Components

| File                            | Role                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/version-mobile.js`     | version bump. Treats Android `build.gradle` as the single source of truth and aborts if iOS has drifted from it. Test: `yarn mobile:version:test` |
| `scripts/deploy-mobile.sh`      | deploy entry point — collects the release message, then dispatches the fastlane lane                                                              |
| `apps/mobile/fastlane/Fastfile` | four lanes (`ios dev\|prod`, `android dev\|prod`), each building and uploading                                                                    |
| `apps/mobile/fastlane/.env`     | credentials (gitignored); template at `.env.example`                                                                                              |

## Troubleshooting

- **iOS signing failure** — the project uses Automatic signing; the lane refreshes signing assets
  itself with `-allowProvisioningUpdates` and the ASC API key. If it still fails, open the scheme once
  in Xcode to check its signing status.
- **Play upload 403** — check Play Console → Setup → API access that the service account is invited
  to that package (the dev app especially).
- **Version-mismatch error** — `version-mobile.js` aborts with "out of sync" when one platform was
  edited by hand. Align both files' version fields manually, then retry.
