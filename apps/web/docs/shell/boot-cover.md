# Boot cover

`index.html` paints a cover — `#splash`, the theme background and nothing else — before any script
runs, and `runtime/bootSplash.ts` removes it once the first real screen has painted. In the native
app the same moment is posted as `FirstScreenReady`, which is what lifts the app's launch splash; the
shell side of that handoff is `apps/mobile/docs/boot/boot-splash.md`.

## Why it has no logo

In the app the launch splash is held over the whole boot and is the only screen that draws the logo.
The cover sits underneath it, so a logo here could only ever be seen as a second copy — in a
different place, at a different size — whenever the two layers swapped. The cover is what shows
where the launch splash cannot: a plain browser, a page reload, a WebView remount, and a boot slow
enough that the shell's 5s cap lifted its splash first. For a boot that slow, three dots fade in
after one second so it does not read as a hang; a normal boot never shows them.

It sits **outside** `#root`, fixed over the page. Inside `#root` React's first commit would replace
it, which is exactly the point at which the app is still a blank provider tree behind session and
router gates that render `null` while they wait.

## What "first screen" means

The cover lifts once the router has mounted its first route **and** no hold remains, after a
two-frame check: the first frame lets React commit what unblocked it, the second is one the browser
has actually drawn. A hold that comes and goes while a check is already counting joins that check
rather than restarting it, so the last frame can be the one that drew its content — harmless, since
the cover's removal and that content then land in the same paint. A hold is anything that would make the first painted screen the wrong
one:

| Hold                          | Taken by                                        | Released when                                                                |
| ----------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| A lazy route still loading    | `RouteFallback` (`useBootSplashHold`)           | the route's chunk resolves                                                   |
| A cold-start deep link or tap | `pendingNavigationStore` while an event is held | the replay has settled (after a cloud switch, for a push into another cloud) |
| The signed-out root           | `PublicRootEntry`, which renders nothing        | the router rebuilds into private routes, or the gate leaves for the invite   |

A hold taken inside the two-frame window cancels the release, so a deep link replayed into a lazy
route right after home mounts does not lift the cover onto home or onto the skeleton.

Two things lift it early, on purpose: the app error boundary and the router's error element
(`bootSplash.release('error')`), so a failure is seen at once. A 10s cap, armed first thing in
`main.tsx`, lifts it whatever is pending — not a budget, just the guarantee that a stalled gate shows
what it rendered rather than an endless blank page.

The handshake (`WebAppReady`) carries `holdsBootSplash: true`. That is how a shell tells this build
from an older one, which never posts `FirstScreenReady` and must be revealed on the handshake
instead.

Out of scope: a screen that renders its own skeleton while its data loads (home with an empty cache)
counts as painted. The cover waits for the route, not for the route's data.

## How to verify

```bash
yarn nx test web
```

`runtime/bootSplash.test.ts` covers the release rules, `bridge/navigation/pendingNavigationStore.test.ts`
the deep-link hold and `bridge/appBridge.test.ts` the handshake flag. In a browser, throttle the
network and reload: the background holds with no logo, the dots appear after a second, and the
cover is gone as soon as the first screen is drawn (`document.getElementById('splash')` is `null`).
