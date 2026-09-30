# ADR-0140: desktop offers a shell update within half an hour, and reports only failures the user started

> Status: Accepted · Decided: 2026-09-30
> Scope: `apps/desktop/src/main/updater.ts` · `apps/desktop/src/main/updateCadence.ts` ·
> `apps/desktop-web/src/app/shared/stores/useUpdateStore.ts` ·
> `apps/desktop-web/src/app/shared/components/UpdateBanner.tsx`

## Context

The desktop shell updates itself with `electron-updater` from a generic feed (`<env>/updates/latest*.yml`,
uploaded by `build-desktop.yml`). It asks before it downloads and again before it restarts, and the
banner that asks lives in desktop-web: the shell pushes `OnUpdateStatus`, and desktop-web renders it.

The shell asked the feed at launch, every six hours, and on wake. On 2026-09-29, 0.0.14 reached the
prod feed at 18:42. An app that had been launched at 10:20 showed nothing, because its next check was at
22:20. A release did not reach an app left open all day.

Checking more often exposed two more problems, both already present at six hours:

- **A check during a download resets the banner.** With `autoDownload` off, every check re-emits
  `update-available`. A check that ran mid-download pushed the offer again, and the banner fell from
  "downloading" or "restart to update" back to "available".
- **"Later" did not hold.** The banner store cleared the dismissal on every status change. A background
  check that failed (offline, a flaky network) pushed `error`, the next one pushed `available`, and the
  banner the user had put away came back. Each failure also showed a warning banner for a check the user
  never asked for.

## Decision

### 1. Four triggers, one gate

The shell asks the feed at launch, about every 30 minutes, on wake, and on window focus. All four share
one gate that lets a check through at most once per 10 minutes, so alt-tabbing does not hammer the feed.
The feed is a single small manifest served `cache-control: no-cache`, so a check costs one small GET.

### 2. No check while an update is under way

While the last status is `downloading` or `downloaded`, no check runs, and an `update-available` from a
check already in flight is dropped. The busy state starts at the Download click, not at the first
progress event.

### 3. Report only a failure the user started

An `error` reaches the banner only while an update is under way — a failed download, or a failed install
or signature check after it. A background check that fails is logged by `electron-updater` and retried
on the next trigger.

### 4. "Later" holds for the version it was given to

The banner store keeps the dismissal when the same version is offered again. It shows the banner again
when the status moves on, or when a newer version is offered.

## Alternatives

- **Server push on publish** (a socket or FCM signal when `build-desktop.yml` uploads the feed). It would
  be truly immediate, but it needs the server, the workflow and the shell to change. Half an hour plus
  focus is close enough for a release.
- **Keep six hours and ask users to restart.** This is what the app did, and a release went unseen for
  most of a working day.
- **Replay the last status to a reloaded renderer** (a new bridge request). A reload drops a status pushed
  earlier. With checks every 30 minutes and on focus, a missed offer comes back within minutes, so it is
  not worth a new message type.
- **Keep showing background failures.** The warning then flaps with the network and undoes "Later".

## Consequences

- A release reaches a running app within about 30 minutes, sooner on focus. The background interval can
  stretch to about 40 minutes when a focus check lands just before a tick, because the gate refuses that
  tick.
- **A broken feed is not visible in the UI.** A 404 or a malformed `latest.yml` used to show a warning at
  launch; it now only reaches the main-process log. A release is checked by confirming that the update is
  actually offered, not by waiting for a warning.
- The two halves ship separately. The shell half reaches users only with a shell release, and that first
  release is itself found by the old six-hour cadence or a restart. The web half ships with desktop-web.
  Either half alone is no worse than before.
- The gate and the busy rule live in an electron-free module (`updateCadence.ts`) with tests. The event
  wiring in `updater.ts` has no unit test, because jest cannot load electron.

## When to reverse

- The feed moves behind something with a request cost or a rate limit. Lengthen the interval and the gap
  together.
- Users need to see feed problems (for example, a self-hosted feed an admin runs). Report background
  failures again, but through something that does not undo "Later".
- A server push channel for releases exists. The interval can then return to a long safety net.
