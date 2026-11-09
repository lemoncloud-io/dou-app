# ADR-0291: A phone app below the version floor sees only the update screen

> Status: Accepted · Decided: 2026-11-09 · Implemented: `feat/app-version-floor`
> · Scope: `apps/web/src/app/features/appUpdate/` (`APP_VERSION_FLOOR`, `AppVersionFloorGate`), the
> fallbacks for phone shells below 0.30.0 across `apps/web` and `libs/`, and one-time carry-overs of
> stored values in `apps/web` and `apps/desktop-web`
> · The behaviour is documented in [apps/web docs/feature/appUpdate](../../apps/web/docs/feature/appUpdate/README.md)

## Context

The phone app loads the web from a server, so every installed app runs the newest web, whichever app
version it is. Each time the shell gained a handler, the web gained a way to cope with a shell that
did not have it yet: a probe, a latch remembered after the first `NOT_FOUND`, a second path for the
missing capability, an "update the app" message. Stored values written by older web builds got a
one-time carry-over of their own.

None of that code could ever be removed, because nothing said an old shell was gone. Removing a
fallback meant guessing. A minimum version was proposed once before and set aside; the cost of not
having one grew with every capability the shell added — about forty such places by November.

## Decision

**The web has a floor, `APP_VERSION_FLOOR`. A phone app below it is shown a full-screen update screen
and nothing else; the rest of the web may assume a shell at the floor or above. The first floor is
0.30.0, and the fallbacks it makes dead are deleted with it.**

- Only `ios` and `android` are held to it, by the injected `CHATIC_APP_CURRENT_VERSION`. The desktop
  shell updates itself; a browser has no app.
- A shell whose version is missing or unreadable is let through — every shipped shell injects one, so
  that is a defect, not an old app.
- The screen sends `OpenStore`, which every shell has handled since long before the floor.
- 0.30.0 (bridge 2.9.0) was chosen over 0.31.2 (bridge 2.20.0). It had been in the stores for two weeks;
  0.31.2 for four days. The fallbacks for bridge 2.10.0 and later — the sub WebView and the voice
  recorder — stay until a later floor passes them.
- One-time carry-overs of values written by older web builds are deleted in the same change. Someone
  who has not opened the app since before such a carry-over gets the default for that value.
- Raising the floor and deleting the fallbacks it makes dead happen in one change, so the floor always
  says which fallbacks may exist.

## Alternatives

- **No floor; keep every fallback.** The state before this. Rejected: the fallbacks only accumulate,
  and each makes the code it guards harder to read and to test.
- **Delete the fallbacks without a floor.** Rejected: an old app would show controls that fail, with
  no way for the person to know an update fixes it.
- **Let the shell enforce the floor at boot.** Rejected for the first floor: it needs a new app release,
  and the apps that most need to be stopped are exactly the ones that would never receive it. The web
  reaches every installed app on its next load.
- **A remotely configured floor.** Rejected for now: there is no remote configuration fetcher, and a
  floor bundled with the web changes exactly when the code that depends on it does.
- **Floor at 0.31.2, deleting every fallback at once.** Rejected: it would stop everyone on a build
  older than four days, including people whose store has not offered the update yet.

## Consequences

- A person on an app below 0.30.0 cannot use the web until they update. The fake shell reports a
  current app version so the end-to-end scenarios run above the floor.
- The web's code for phone shells now has one lower bound to reason about, written in one place.
- Old stored preferences that were never carried over are lost; the carry-overs themselves are gone.
- The update screen never shows on desktop or in a browser, but the carry-overs removed in this change
  ran there too: they moved values older builds wrote into the settings registry when it arrived in
  September 2026. The desktop store migrations from October and November, and the legacy mute map,
  which is still read on every lookup, are kept — they are not old.
