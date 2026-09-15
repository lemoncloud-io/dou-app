# Onboarding

What a fresh checkout needs before anything builds or runs — env files, Firebase config, and the
release/signing credentials most local dev never touches. Prerequisites (Node, Yarn, Xcode,
Android Studio, CocoaPods, Ruby) and install steps are in [README.md](./README.md#getting-started);
this file starts where that leaves off.

## Required for local dev

Copy the example environment files and fill in your values:

```bash
# Web
cp apps/web/.env.example apps/web/.env

# Admin V2
cp apps/admin-v2/.env.example apps/admin-v2/.env

# Mobile — the LOCAL env (see the mobile section below for .env.dev / .env.prod)
cp apps/mobile/.env.example apps/mobile/.env

# Testbed (experimental app)
cp apps/testbed/.env.example apps/testbed/.env
```

`apps/landing` needs no `.env` — it has none to copy. `apps/desktop` needs no copy step either —
its `.env.dev` / `.env.production` are already committed (no secrets in them; CI injects real FCM
values). Only for local push testing, add a gitignored `apps/desktop/.env.dev.local` with real
values, following `apps/desktop/.env.example`.

> [!WARNING]
> Environment files (`.env`) must exist before building. The app will not start without them.

> [!IMPORTANT]
> **Migrating an existing mobile checkout.** `apps/mobile/.env` used to be the dev env on iOS; it is
> now the LOCAL env on both platforms, and dev/prod builds read `.env.dev` / `.env.prod`. Move your
> current dev values to `apps/mobile/.env.dev`, then recreate `.env` from `.env.example`. Android is
> unaffected — it already read `.env.dev` / `.env.prod`.

## Mobile-only checklist

- **`.env` / `.env.dev` / `.env.prod`** — `.env.example` is the public template for the LOCAL env
  only. `.env.dev` and `.env.prod` carry real backend endpoints and aren't covered by a template;
  ask a teammate for values. See [apps/mobile/docs/local-run.md](apps/mobile/docs/local-run.md).
- **Firebase config (push notifications)**:

    ```bash
    # iOS — copy and fill with your Firebase config
    cp apps/mobile/ios/Firebase/GoogleService-Info.plist.example \
       apps/mobile/ios/Firebase/GoogleService-Info-Dev.plist

    # Android — copy and fill with your Firebase config
    cp apps/mobile/android/app/src/google-services.json.example \
       apps/mobile/android/app/src/dev/google-services.json
    ```

- **`debug.keystore`** — already checked into the repo (`apps/mobile/android/app/debug.keystore`).
  Nothing to do for local dev/debug builds.

## Optional — release and signing credentials (not needed for local dev)

Only required when producing a signed release build, and normally handled by CI, not a local
checkout:

- **Android release keystore** — `chatic-dou.keystore` plus `ANDROID_KEYSTORE_PASSWORD` /
  `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` (marked "release builds only" at the bottom of
  `apps/mobile/.env.example`). Generate your own; never reuse someone else's release key.
- **iOS / desktop notarization — App Store Connect API key (`.p8`)** — used by
  `apps/mobile/fastlane/Fastfile` (TestFlight upload) and by
  `apps/desktop/.env.signing.example` (macOS notarization). Keep the `.p8` file itself **outside**
  the repo; both consumers only need a path to it.
- **Desktop code signing** — copy `apps/desktop/.env.signing.example` to `apps/desktop/.env.signing`
  (gitignored) for `yarn desktop:package:mac:prod:signed`.

None of these release/signing credentials are committed — `.gitignore` excludes every real
`.env*` (aside from desktop's non-secret `.env.dev`/`.env.production`), every
`GoogleService-Info-{Dev,Prod}.plist`, `google-services.json`, `*.keystore` (except
`debug.keystore`), and `*.p8`. Only the `.example` templates are tracked.

## Not needed for local dev — deployed infra, not app config

[`docs/infra/`](./docs/infra/) holds config/code that deploys outside the Nx workspace, to Firebase
rather than to an app or a lib. [`docs/infra/deep-linking/`](./docs/infra/deep-linking/README.md)
is the current example: the Firestore rules, indexes, and cleanup functions behind the deferred
deep-link flow. Deep links and universal links themselves work locally with no setup from this
folder — it only matters to whoever deploys or changes that backend.
