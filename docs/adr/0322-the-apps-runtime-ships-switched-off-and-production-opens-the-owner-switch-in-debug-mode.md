# ADR-0322: The app's runtime ships switched off, and production opens the owner switch in debug mode

> Status: Accepted · Decided: 2026-11-16 · Implemented: `feat/prod-debug-session-owner`
> · Scope: `apps/mobile/src/app/services/runtime/sessionOwnerSwitch.ts` (`isSessionOwnerSwitchAllowed`);
> `apps/mobile/src/app/webview/hooks/sessionOwnerHandlers.ts` and `useSessionOwnerHandler.ts`; the web
> debug overlay's Session owner screen copy
> · The behaviour is documented in [apps/mobile docs/runtime](../../apps/mobile/docs/runtime/README.md)
> and [apps/mobile docs/release/deploy.md](../../apps/mobile/docs/release/deploy.md)
> · Amends: [ADR-0314](./0314-a-native-session-ends-by-restarting-the-apps-js-context.md) decision 5 —
> the switch is gated by the stage _or_ the app's debug mode, not by the stage alone
> · Amended by: [ADR-0328](./0328-a-dev-build-starts-an-unswitched-install-on-the-apps-runtime.md) —
> decision 1 holds for production builds; a `DEV` stage build starts an unswitched install on the runtime
> · Amended by: [ADR-0330](./0330-production-starts-on-the-apps-runtime-and-the-web-names-the-default.md) decisions 1 and 5

## Context

ADR-0309 let the phone app's own runtime hold the session, settled once per launch, and ADR-0314 put the
choice behind a development switch that only a local or test stage build answers. Everything the
runtime needs is now in the app. What was left open is when real installs start using it: the first app
version that can answer `native`, how many installs get it, and when it becomes the default.

The two owners were measured against each other on release builds, an Android emulator and an iOS
simulator, with the same guest on both sides:

- **Cold start** (`boot`, `first_screen`): the same, or the app's runtime slightly faster at p95.
- **Opening a room the device has cached**: the app's runtime is 17–34 ms slower at p95 (45 → 62 ms on
  iOS, 67 → 101 ms on Android). The first room after a cold start is the same on both.
- **Memory** (app and web content together): +7% after ten room entries on Android, less than the
  page's on iOS.

Those are one device each, a guest with one room, and no physical phone. A switch only a development
build answers cannot produce the numbers that are missing, because no production install can turn it
on.

## Decision

1. **0.32.0 is the first app version that carries the runtime, and it ships switched off.** Every
   launch is the page's unless someone turns the switch, exactly as before. The app version floor stays
   where it is: a shell that predates the runtime never offers it, so the page never asks it.
2. **A production build answers the owner switch while the app's debug mode is on.** Debug mode is the
   unlock the overlay already sits behind (ten taps on the Lab page and the entry code); the page tells
   the app with `SetDebugMode`, and the app keeps the flag. A local or test stage build answers the
   switch always, as before. Both requests are registered on every build and refused with
   `NOT_ALLOWED` while the switch is not offered; the check runs on each request, because debug mode can
   change while the app runs.
3. **Debug mode gates changing the owner, not keeping it.** A production install moved onto the runtime
   stays there until someone unlocks debug mode again and moves it back, or the app is removed. The page
   turns the app's debug flag off on every boot, so a rule that tied the owner to the flag would undo a
   switch on the very restart that applies it.
4. **A production build needs the runtime's own service settings in its env file**, the same values the
   web build of that stage uses. Without them the runtime cannot start and the app answers the page's
   hello with `web`, so the switch fails safe rather than breaking the launch — the overlay's "This page"
   row is how a tester tells the two apart.
5. **Not decided here:** what share of installs gets the runtime, and when it becomes the default. That
   needs a switch the server controls rather than a person, and the numbers from this internal round to
   set its thresholds. Until then no production install runs the runtime unless a person chose it.

## Alternatives

- **Keep the switch to development builds and roll out with a server switch straight away.** Rejected:
  the share and the thresholds would be guesses, and the first production install to run the runtime
  would be a user's rather than a tester's.
- **A separate internal build flavour with the switch.** Rejected: the testers would be measuring a
  binary nobody else receives.
- **Hand an install back to the page whenever debug mode reads off.** Rejected: the page clears the app's
  debug flag on every boot, so the switch would last one launch. Keeping the flag across launches
  instead would change what debug mode means everywhere else in the app.
- **Turn the runtime on by default in 0.32.0.** Rejected: no measurement on a physical phone, the open
  keychain question below, and no way back for an installed app short of another release.

## Consequences

- Internal testers run the runtime on the shipped 0.32.0 binary against production, so what they
  measure is what a rollout would ship.
- A tester who forgets to switch back stays on the runtime. Reinstalling the app, or switching back
  from the overlay after unlocking it again, are the ways out.
- The app does not check the unlock itself: it takes debug mode from the page's `SetDebugMode`, which
  the overlay sends only after its unlock. The entry code is in the web bundle; it hides the door rather
  than locking it. Anyone who passes it can move their own install, and only their own session is
  reachable that way.
- One open risk is not settled by this decision: in the simulator measurement, a launch the runtime
  owned once came up as an account that had signed in on that simulator before the app was reinstalled.
  The device keychain outlives a reinstall, and the runtime reads the vault from it. It did not repeat
  after the keychain was cleared. It has to be understood before the runtime is turned on for anyone
  outside the internal round.
- The warm room-entry cost is accepted for the internal round and is one of the numbers its results have
  to settle.
