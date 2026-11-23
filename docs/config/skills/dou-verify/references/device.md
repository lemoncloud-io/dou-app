# Device check (opt-in, never a gate)

Simulators and emulators only. Runner mechanics: [`apps/mobile/docs/release/device-verify.md`](../../../../../apps/mobile/docs/release/device-verify.md).

**Offer it in one line** when the changed feature has a scenario (`yarn mobile:verify --list` shows
`<feature>/…`, or the change is native code under `apps/mobile`) and a device could show it differently from a
browser (native capability, keyboard, safe area, animation, boot). Run it unasked only when asked to verify on a
device.

## Run

`yarn mobile:verify <feature>/<scenario> --platform ios` in the background; Android after iOS finishes, never in
parallel (a machine-wide lock; parallel builds have restarted the Mac). `--web dev` for native-only changes,
`--keep-device` for hand checks after. No scenario: `yarn mobile:verify --app-only --platform ios`, then use the
UDID/serial it prints (`xcrun simctl io <udid> screenshot`, `adb -s <serial> exec-out screencap -p`), and stop it
with the `kill <pid>` its "Holding…" line prints.

## Read the exit code

- **0** — passed. Still open every `checkpoint-*.png` and say what each shows.
- **2** — could not run. Relay the printed fixes; do not retry in a loop. A build `error:` in code this branch
  changed is a product bug. Never stop another session's process or emulator.
- **1** — a scenario failed. Open `final.png`, `maestro.log`, `commands.json`. Wrong screen → product bug (check
  `develop` before blaming your change). Right screen, missed step → stale selector, update it in this change.
  Late screen → run once more; a second identical failure is not timing. Home screen → app crashed, report it
  even if a rerun passes. OS dialog on top → environment.

## Show what it saw

The shots that show the change — `final.png` and the relevant `checkpoint-*.png` from the scenario folder under
`tmp/mobile-verify/<timestamp>-<platform>/` — go into the session's completion report, each with a caption, iOS
and Android side by side when both ran. The same shots go into the PR body through `pr-assets/pr-<n>`
([`dou-ship/references/pr.md`](../../dou-ship/references/pr.md) § Visuals) as they are when the run used the dev
backend, whose data is all fictional; a run against production stays in the session report.

## Limits to say

A simulator pass does not prove a compositor or WebKit-on-device bug; push delivery and remote video frames do
not behave like a phone.
