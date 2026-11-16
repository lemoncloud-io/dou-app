# ADR-0328: A dev build starts an unswitched install on the app's runtime

> Status: Accepted · Decided: 2026-11-16 · Implemented: `feat/dev-native-session-owner`
> · Amended by: [ADR-0330](./0330-production-starts-on-the-apps-runtime-and-the-web-names-the-default.md) decisions 1 and 3
> · Scope: `apps/mobile/src/app/services/runtime/sessionOwner.ts` (`defaultSessionOwner`,
> `readSessionOwner`), `launchSessionOwner.ts`, `sessionOwnerSwitch.ts`; `scripts/mobile-verify/envfile.js`
> · The behaviour is documented in [apps/mobile docs/runtime](../../apps/mobile/docs/runtime/README.md#who-owns-the-session)
> · Amends: [ADR-0322](./0322-the-apps-runtime-ships-switched-off-and-production-opens-the-owner-switch-in-debug-mode.md)
> decision 1 — "ships switched off" now holds for production builds only

## Context

ADR-0322 shipped 0.32.0 with the app's runtime switched off on every build: a launch was the page's
unless someone pressed the owner switch in the debug overlay. On the DoU Dev app (a `DEV` stage build)
that meant every tester, on every fresh install or reinstall, had to find the overlay's Session owner
screen and switch before they were testing the runtime at all. Most dev launches therefore ran the page,
and the internal round that ADR-0322 set up to produce the missing numbers mostly measured the owner it
already knew.

## Decision

1. **An install nobody switched runs on the app's runtime in a `DEV` stage build.** The default is read
   from the build's baked `VITE_ENV`. `LOCAL` builds keep the page, and so does production — together
   with any value the build cannot recognise, which counts as production everywhere the app reads its
   stage.
2. **A recorded choice outranks the default.** The switch writes `web` or `native` to the owner file; a
   dev install switched to the page stays on the page. Before this, a recorded `web` and no record at all
   meant the same thing; now only the absence of a record falls through to the default.
3. **A non-production build can name its default** with `VITE_SESSION_OWNER_DEFAULT` (`web` or
   `native`). The device-verify harness pins its builds to `web`, so its scenarios keep starting from a
   cleared install on the page and reach the runtime through the switch, as before. **Production
   ignores the setting**: whether real installs run the runtime stays a decision about installs (ADR-0322
   decision 5), not one an env file can make by accident.
4. **An owner file that cannot be opened is the page's on every build.** A setting the app cannot read
   must not move the session.

## Alternatives

- **Put the default in the env files only** (`VITE_SESSION_OWNER_DEFAULT=native` in `.env.dev`).
  Rejected as the only mechanism: the env files are not in the repository, so the behaviour would live
  in whichever copy built the binary, and nothing here would say what the DoU Dev app does.
- **Default `LOCAL` builds to the runtime too.** Rejected for now: a `LOCAL` build usually points at a
  developer's own web server and often lacks the runtime's service settings, so it would fall back to
  the page on every launch while logging a failed runtime start. A local run with a `DEV` mobile env is
  a dev build all the same.
- **Make the harness press the switch towards whichever owner a run asks for.** Rejected: the switch
  only restarts when the owner changes, so the flow would need to know the starting owner of each build
  anyway; pinning the build's default keeps the existing flows unchanged.

## Consequences

- Dev testers run the runtime without touching the overlay, and so meet every gap the runtime doc lists
  under "What is not done yet" on every launch — the paired-cloud check not running, logout markers that
  do not cross owners, a restart counted as a cold boot.
- A dev install that ran the page on an earlier build moves to the runtime on its first launch of a build
  with this default. What the page kept in its own plain storage does not come along, so the selected
  cloud starts empty once, as after a switch. The device guest's id crosses only if a page build that
  copies it into the vault ran first; an install without that launch does not see the invited clouds it
  accepted until it signs in as a guest again. Accepted for dev builds; it still has to be closed before
  production gets this default.
- The stage is the baked `VITE_ENV`, so a local run whose mobile env says `DEV` is a dev build and starts
  on the runtime too.
- No device scenario boots a fresh install straight onto the runtime: the harness pins its builds to the
  page and reaches the runtime through the switch.
- A dev build without the runtime's service settings tries the runtime on every launch, fails before
  anything starts, and leaves the session to the page. The dev env file has to carry them (mobile
  `docs/release/deploy.md`).
- The binary decides: an installed DoU Dev app built before this change keeps the page until it is
  replaced by a build that carries it.
