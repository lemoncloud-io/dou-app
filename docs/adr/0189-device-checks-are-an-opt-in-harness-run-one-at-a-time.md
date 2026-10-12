# ADR-0189: Device checks are an opt-in harness, run one at a time per machine

> Status: Accepted · Decided: 2026-10-12 · Implemented: `feat/device-verify-harness`
> · Scope: `scripts/mobile-verify/` (the runner, `yarn mobile:verify`) · `apps/mobile/e2e/` (scenarios)
> · `docs/config/skills/dou-device-verify/` (the procedure)
> · The module doc is [apps/mobile release/device-verify.md](../../apps/mobile/docs/release/device-verify.md)
> · Extends [ADR-0114](./0114-agent-procedures-in-docs-and-a-general-language-rule.md) (a fifth procedure)

## Context

End-to-end testing is being split into three tiers: contract tests that keep each native shell's
bridge honest, browser end-to-end tests of the web inside a fake native shell on every pull request,
and flows on a real simulator and emulator. Most of the product runs in the WebView, so the first two
cover most of it; what is left is what only the real app shows: the photo library, the keyboard, the
launch splash, WebKit's own behaviour.

Those checks were being done anyway, by hand and by agents, and every one of them paid for the same
traps: an agent's shell without a UTF-8 locale (CocoaPods dies) or `ANDROID_HOME` (Gradle cannot
find the SDK), gitignored env and Firebase files missing in a fresh worktree, another session already
holding the web and Metro default ports, a peer's app installed on the simulator being tested, a
react-native-static-server CMake cache shared through `$TMPDIR`, a version-code downgrade on a shared
emulator. One parallel iOS and Android build next to vite and Metro restarted the machine, taking
every session on it down. The knowledge to avoid all this lived in one person's private notes, which
the repository cannot point to.

## Decision

**A device check is a scenario run by one command, `yarn mobile:verify`, and it is opt-in.** Not a CI
job, not a commit or agent hook, not a required step of a pull request. An agent offers it when a
changed feature has a scenario and the change is of a kind a device can show; a checklist line left
unchecked is not unfinished work.

- **The runner owns the machine; scenarios own the app.** Preflight, ports, devices, the build, the
  servers, the lock and restoring the tree are the runner's. The tool that drives the app sits behind
  one adapter (file extension, tag reader, preflight, `run`). The first adapter is Maestro.
- **Scenarios are per feature**, under `apps/mobile/e2e/flows/<feature>/`, named exactly like the
  feature's folder in `apps/web/src/app/features` so a change maps to its scenarios by name. `smoke`
  marks the few worth running on a schedule; the rest run on demand.
- **One device run per machine.** A lock under the user's cache directory, and a wait while the runner
  sees heavy work the lock cannot — another `xcodebuild`, a Gradle build, an emulator it did not start.
  The runner never stops another session's process; it names it and gives up after a wait.
- **The harness uses its own devices and ports.** A simulator and an AVD it creates and addresses by
  UDID or serial, and port ranges away from the defaults, remembered per checkout because both are
  compiled into the build.
- **It never moves secrets.** It prints the exact copy from the main checkout for each missing
  gitignored file and leaves the copy to the person or agent; the env file a build reads is derived
  outside the checkout and never printed.
- **Three exit codes**: 0 passed, 1 the app ran and a scenario failed, 2 it could not run. An agent
  relays an exit 2's printed fix instead of retrying.

## Alternatives

- **A macOS CI job, nightly or per pull request.** It would make the smoke scenarios a schedule rather
  than a habit. It needs a macOS runner with an Android emulator, minutes per scenario, and the dev
  backend's test sign-in from CI — and as the per-PR gate the cost is out of proportion, which is why
  the per-PR tier runs the web in a fake shell instead.
  The `smoke` tag keeps the door open; nothing here runs in CI yet.
- **A Claude Code hook that runs the check after a change.** A gate by another name: a cold build is
  several minutes of a machine other sessions share, and most changes do not need it.
- **The procedure without a runner.** What existed, in private notes. Each agent re-learned the traps,
  and a written procedure cannot take a machine-wide lock or restore what `pod install` rewrote.
- **Calling the tool directly (`maestro test`) with no runner.** Leaves the build, the ports, the
  device and the lock to every caller — the exact list that went wrong.
- **A shell script.** Shorter to start, but the runner's decisions (port choice, the lock, the
  fingerprint, the env merge) deserve unit tests, which the repository's Node scripts already have.

## Consequences

- A harness to maintain beside the app: a native build change (a new gitignored file, a new build
  setting) has to reach the runner too, or the first run after it fails with exit 2.
- Scenarios select by the text the user reads, because DOM ids do not cross the WebView's
  accessibility boundary. A copy change breaks a selector; the procedure tells "the screen is wrong"
  apart from "the scenario is stale" before anyone calls it a bug.
- Device work is serialized machine-wide, including hand checks held open with `--app-only`. A
  forgotten one holds every other device run until its wait gives up.
- A simulator pass says nothing about a compositor or WebKit-on-device bug; the procedure makes the
  agent say so.
