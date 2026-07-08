## fastlane documentation

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios dev

```sh
[bundle exec] fastlane ios dev
```

Build the dev app and upload to TestFlight (dev app)

### ios prod

```sh
[bundle exec] fastlane ios prod
```

Build the prod app and upload to TestFlight

---

## Android

### android dev

```sh
[bundle exec] fastlane android dev
```

Build the dev app bundle and upload to the Play dev-app track

### android prod

```sh
[bundle exec] fastlane android prod
```

Build the prod app bundle and upload to the Play prod-app track

---

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
