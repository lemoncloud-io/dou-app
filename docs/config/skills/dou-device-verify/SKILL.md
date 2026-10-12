---
name: dou-device-verify
description: >-
    Check a change on the iOS simulator or the Android emulator with the real app — a feature's
    device scenario through `yarn mobile:verify`, or a hand check when none exists. Read and follow
    this when someone asks to see a change on a device, simulator or emulator, when a change touches
    native behaviour (photos, keyboard, splash, WebView quirks) and its feature has a scenario, or
    when told to run the device-verification step. Optional — never a gate.
---

# dou-device-verify

Unit and contract tests, and the web's end-to-end tests in a fake native shell, cover what runs in
the browser. This step is for
what only the real app on a device shows. It is **optional**: nobody has to run it, and a checklist
line left unchecked is not unfinished work. The runner's mechanics — ports, builds, locks, the files
it needs — are in [`apps/mobile/docs/release/device-verify.md`](../../../../apps/mobile/docs/release/device-verify.md);
this file is what you do around it.

## When to offer it

Offer it — in one line, after the implementation is done — when **both** hold:

- the change touches a feature that has a scenario: `yarn mobile:verify --list` shows
  `<feature>/…` for the folder you changed under `apps/web/src/app/features/<feature>` (the names
  match exactly), or the change is native code under `apps/mobile`; and
- it is the kind of change a device can show differently from a browser: a native capability, the
  keyboard, layout under the safe area, an animation, the boot path.

Run it without asking only when you were asked to verify on a device. Never run it as a habit
after every change: a cold build is several minutes of a shared machine.

## Run it

```bash
yarn mobile:verify <feature>/<scenario> --platform ios
```

Then, if Android matters too, the same with `--platform android` — **after** the iOS run has
finished, never beside it. The runner holds a machine-wide lock and will wait for any other device
run or build anyway; do not try to work around that by running two commands in parallel.

- Run it in the background (it takes minutes) and read the exit code when it ends. Do not poll the
  logs while it builds.
- `--web dev` when the change is native only and the deployed dev web is enough.
- `--keep-device` when you will do hand checks afterwards on the same app.

## Read the outcome

**Exit 0 — passed.** Every assertion held. Now look at the checkpoints (below) before saying it
works: a pass says what was asserted, not that the screen looks right.

**Exit 2 — could not run.** The output lists each problem with the command that fixes it. Relay
those to the person, as written. One exit 2 has no fix line: "The runner itself failed" with a stack
trace is a harness bug — report it with the trace; do not retry or work around it. **Do not retry in a loop**: nothing changes until someone acts.
Some fixes are yours to run (copying a gitignored file from the main checkout that the output
spells out, installing Maestro); some are theirs (anything with `sudo`, installing Xcode or an SDK
image, stopping another session's build or emulator). Never stop or kill another session's process
— the runner names it so its owner can.

A build failure is also exit 2. Read the first `error:` in `build.log`: an error in code this
branch changed is a product bug to fix, not an environment problem to report.

**A busy machine** is exit 2 after the runner has waited (`--wait`, 15 minutes by default) for other
device work, and it says what each blocker is:

- _A build or another device run_ ends on its own. Tell the person, and one more run with a longer
  `--wait` is fine — that is not a retry loop.
- _Someone else's emulator_ does not end on its own. Tell the person which one (the runner prints
  the folder it runs in) and wait for them; never stop it yourself.
- _The harness's own emulator_ (`DoU_Verify`) running while no run holds the lock was left by a
  `--keep-device` run or one that died. The runner prints the exact `adb -s … emu kill`; that one is
  yours to run.

**Exit 1 — a scenario failed.** The app ran; something was not as the scenario expected. Before
calling it a product bug, decide which of two it is:

1. Open the scenario's `final.png` and the tool log (`maestro.log`) in its output folder. Find the
   step that failed — Maestro's `commands.json` lists every step with its status, and
   `screen-hierarchy/` holds what the screen exposed at the failed step.
2. **The screen is wrong** — an error, a blank page, the wrong screen, a crash back to home: a
   product bug. If your change could cause it, fix it; if not, check whether `develop` shows it too
   before reporting it.
3. **The screen is right but the step missed** — the text changed, a label was reworded, the element
   is there under a different name: the scenario is stale. Update the selector in the same change, and
   say so.
4. **Timing** — the screen got there a moment later than the wait: run once more. A second identical
   failure is not timing.
5. **The app is gone** — `final.png` shows the device's home screen. The app crashed or was closed.
   Run once more; report it either way, with the run folder, because a pass on the second run does
   not explain the first.
6. **Something covered the app** — an OS dialog ("isn't responding", a permission prompt) in
   `final.png`. That is the environment, not the product; say so.

## Judge the checkpoints

A scenario saves `checkpoint-<what>.png` where correctness needs eyes. Open each one and check it
against what the step names — read the scenario file, the comment above the `takeScreenshot` says
what to look for, and what is expected noise (dev-build overlays: a LogBox banner, a "debug" pill).
Describe what you saw in words, in the report. Say plainly when one looks wrong or
when you cannot tell; a checkpoint you did not look at is not checked.

## No scenario yet: check by hand

Start the app with no scenario, in the background:

```bash
yarn mobile:verify --app-only --platform ios
```

It does everything a scenario run does up to the scenario — preflight, lock, build or reuse,
install — then launches the app once, saves `launch.png`, and holds the device, the web dev server
and Metro up until it is stopped. Wait for its "Holding the device…" line; the line before it, "The app
is up on … device <id>", gives the simulator UDID or the emulator serial. Use that on every command below — other sessions use other devices on
the same machine. Exit codes before that line mean what they mean for a scenario run.

**iOS simulator**

- Screenshot: `xcrun simctl io <udid> screenshot shot.png` (it hangs now and then; give it a 20 s
  timeout). It is fresher than a simulator-control panel's screenshot, which can be a stale frame.
- Tap and type: an agent with simulator controls can use them — give a tap a small duration
  (about 0.1 s); instant taps often do not land, nor do taps right after a navigation. Otherwise a
  throwaway Maestro flow (`maestro --device <udid> test my-check.yaml`) does the same.
- Reach a screen directly: `xcrun simctl openurl <udid> chatic-dev://<path>`; the first link from
  the background may raise an "Open in …?" alert.
- The text tool types ASCII only; `+` cannot go into a phone field that way.

**Android emulator**

- Screenshot: `adb -s <serial> exec-out screencap -p > shot.png`
- Tap and type: `adb -s <serial> shell input tap <x> <y>`, `input text <ascii>`.
- Back: `adb -s <serial> shell input keyevent KEYCODE_BACK` — it reaches the web as Escape, which
  closes the top overlay.
- Reach a screen: `adb -s <serial> shell am start -a android.intent.action.VIEW -d "chatic-dev://<path>"`

To find what a selector should be, `maestro --device <id> hierarchy` prints the accessibility tree
the scenario sees; web text appears there as the user reads it.

When you are done, stop the runner with Ctrl-C, or with the `kill <pid>` its "Holding…" line prints
(that is the runner's own process — not a `pgrep` match, which also finds the shell around it). It
shuts the device down,
stops the servers, restores the tree and releases the machine lock. Do not leave it holding — the
lock keeps every other device run on the machine waiting.

**Then offer to keep it.** A hand check that took more than a couple of steps is worth a scenario.
Offer to save it as `apps/mobile/e2e/flows/<feature>/<scenario>.yaml`, written to the rules in the
module doc's "Writing one" section, and run it once through the runner before calling it saved.

## The checklist line

In the verification checklist (`dou-implement` § 3), one line per platform:

```markdown
- [x] Device (iOS 26.3 simulator): `yarn mobile:verify home/open-room --platform ios` — passed; checkpoints: home list drawn under the status bar, room composer visible
- [ ] Device (Android emulator): not run — optional
```

Check the box only for a run you did and read, with the platform and what the checkpoints showed.
A hand check gets a line too: what you did and what you saw.

## Limits — say them

- **Simulators and emulators only.** Not a physical device.
- **A simulator pass is not proof for a compositor or WebKit-on-device bug.** A WebKit
  `backdrop-filter` black flash seen on iPhones did not reproduce on the simulator. When the change
  is of that kind, say the simulator could not show it.
- Push delivery and remote video frames do not behave like a device on the simulator.

## Before you answer

- Did you say which platform(s) ran, and the exit code of each?
- For exit 2: did you relay the printed fixes rather than retry?
- For exit 1: did you say whether it was the product or the scenario, and why?
- Did you look at every checkpoint and say what it showed?
