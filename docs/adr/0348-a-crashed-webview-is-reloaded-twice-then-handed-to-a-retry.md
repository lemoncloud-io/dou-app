# ADR-0348: A crashed WebView is reloaded twice, then handed to a retry

> Status: Accepted · Decided: 2026-11-18 · Implemented: `fix/webview-crash-loop-recovery`
> · Scope: `apps/mobile` — `webview/hooks/useWebViewCrashRecovery.ts`, `AppWebView`, `MainScreen`,
> `WebViewErrorView`
> · The behaviour is documented in
> [apps/mobile docs/boot/boot-splash.md § When reloading stops](../../apps/mobile/docs/boot/boot-splash.md#when-reloading-stops)
> · Builds on: [ADR-0097](./0097-unified-logging-core-and-report-traceability.md) (WebView crashes
> are queued natively and relayed by the next page)

## Context

When the WebView's content process dies, the shell has always done one thing: record the crash,
put the crash-reload cover up, and call `reload()`. It did that on every termination, with no memory
of the last one, and the cover lifted after 5s whatever the reload had done.

That is right for the common death — the OS reclaiming a backgrounded page — and wrong for two
others, both seen on an iOS 26.3 simulator:

1. **A page that dies every time it loads.** The JavaScriptCore DFG compiler faulted
   (`CodeOrigin::approximateHash`, a protection fault on a JIT worker thread) about three seconds
   into the page's boot, after it had reported its first screen. Reloading only schedules the next
   crash.
2. **A reload that never comes up, and says nothing.** The process launched for that reload died
   while starting (`dyld_sim` faulting in `DyldSharedCache::getUUID` — the simulator runtime's shared
   cache was not mapped). No second termination callback reached the app: its log holds one
   `webview-crash` entry for two dead processes. The cover lifted at its cap onto the dead page's
   last frame, a loading spinner, and the app sat there until it was killed. A fresh WebView can
   meet the same death: mounted again by hand, its first process died while starting, again with no
   callback, and the screen stayed blank.

Both crashes are in the simulator runtime rather than the app. The `dyld_sim` fault reads the shared
cache header at an address where nothing is mapped; the JIT fault reads a pointer into an unmapped
region dyld reserved, and on other days the same simulator faulted in unrelated JavaScriptCore code
(rope strings, regular expressions) — the signature of a broken mapping, not of one JIT bug a page
pattern triggers. Earlier checks ran the same builds on an iOS 18.3 simulator without either, and a
simulator reboot cleared them. The handling is still the app's problem: nothing guarantees
a phone's WebKit never does the same, and on a phone there is no reboot the user would think of.

## Decision

### 1. Stop reloading after three terminations in a minute

The first termination is reloaded, and the second, in case it was bad luck. The third inside 60s is
not: the WebView is replaced with the retry view. A first screen between the deaths does not reset
the count, because the loop above reaches its first screen every time.

### 2. Every page has 30s to report its first screen

Each mount, and each reload after a crash, arms a watchdog that any reveal — `FirstScreenReady`, or
the handshake from an older web build — disarms. When it fires, the same retry view replaces the
WebView. The web reports at its own 10s boot-cover cap once its script runs, whatever else happens,
which leaves 20s for the page and its bundle to arrive; missing 30s means there is no live page.

Only foreground time counts: the OS often reclaims a backgrounded page, and its reload cannot paint
until the app is back; an app launched in the background mounts its WebView unseen.

This is the rule that rescues case 2. The termination count alone could not, because WebKit did not
report the deaths. It has to cover a fresh mount too, or "Try again" leads straight back to a blank
screen.

### 3. The retry is a remount, and the reports are kept

"Try again" remounts the WebView by key — the path a failed page load already uses — so it gets a new
WebView, a new content process, and a new count. Every termination still goes into the pending-report
queue as `webview-crash`, and giving up adds one entry naming the rule (`crash-loop` or
`no-first-screen`), so the next page that boots relays the whole story.

The retry view says the screen could not be shown, not "check your connection": the network is not
the cause here.

## Consequences

- A user in a crash loop sees a retry screen in about the time three boots take, instead of a page
  that keeps reappearing and dying, or a frozen loading screen.
- A page slower than 30s on a bad network gets the retry view even though it would have finished.
  On a cold start that is a page whose bundle took over 20s to arrive; the retry loads it again,
  partly from cache.
- On Android a WebView whose render process is gone cannot be reused, so its `reload()` most likely
  does nothing and the first-screen rule ends every Android crash on the retry view after 30s. That is
  better than the dead view it replaces, and worse than remounting at once, which needs the count
  and the watchdog to live above the WebView and is left for a change that can be checked on an
  emulator.
- The thresholds are guesses from one case. The relayed `WebView crash recovery gave up: …` entries are the data
  to revisit them with.
- No web-side workaround for the JIT fault is made. Nothing ties it to one function of the bundle,
  and changing code to dodge a fault nobody has seen on a phone would be a guess. The relayed
  `webview-crash` entries from phones are where one would first show.
