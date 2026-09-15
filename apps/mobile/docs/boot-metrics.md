# Boot metrics

`BootMetricsService` (`src/app/services/perf/BootMetricsService.ts`) times the app launch, from
process start to WebView interactivity, on both the native and web sides, and persists one record per
boot into an MMKV ring buffer. See also [webview.md](./webview.md) and [service.md](./service.md).

## Timeline

```
[Native — BootMetricsService, baseline: provider construction (≈ JS entry)]
provider-ready       DependencyProvider's synchronous init completes (MMKV, SQLite, services)
app-mount            root component tree commits
main-screen-mount    the WebView screen mounts (network starts right after)
load-start           WebView onLoadStart
load-end             WebView onLoadEnd
web-app-ready        WebAppReady bridge message received → totalMs

[Web — bootMarks, baseline: page load start (timeOrigin)]
main-start · app-render · session-initialized (router unblocked)
+ Navigation Timing (TTFB, DOMContentLoaded, load)
+ per-bundle cache-hit heuristic for /assets/ (transferSize + duration)
```

The two timelines share no clock — native `load-start` and web `0ms` (timeOrigin) are the point where
they line up for reading side by side.

## Data flow

1. Once the router unblocks, the web waits 3 seconds (to let late resource entries land) and sends one
   `SendBootMetrics` snapshot (`reportBootMetrics.ts`; skipped when running standalone in a browser).
2. Native's `usePerfHandler` receives it and calls `BootMetricsService.attachWebMetrics()`.
3. The record finalizes once both the `web-app-ready` mark and the web snapshot have arrived; if the
   snapshot has not landed within 5 seconds of `web-app-ready`, the record finalizes anyway with
   `web: null`.
4. The record is prepended to MMKV key `bootMetrics.records`, capped at the newest **50**.

## Boot types

| Type     | Meaning                                                                                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cold`   | a boot from process start                                                                                                                                                                                                                  |
| `reload` | the iOS WebView content process was killed by the OS and `reload()` restarted it — effectively a re-boot. `AppWebView.handleContentProcessDidTerminate` starts a fresh session, first finalizing whatever the aborted session had recorded |

A foreground resume is a separate record: `useResumeOverlay` calls `recordForegroundResume()` with the
time from `active` until the overlay clears — either `DismissResumeOverlay` from the web or, on iOS
only, a 1.5-second cap if that message never comes (the flash this overlay hides does not occur on
Android).

## Reading the records

There is no native debug UI any more (removed under ADR-0080); the boot timeline is read from the web
debug panel instead:

- **Boot** screen (`apps/web/.../debug/overlay/screens/BootScreen.tsx`) — the _current_ web session's
  live timeline: navigation timing, paint vitals (FCP/LCP), and which `/assets/` bundles served from
  cache, polled once a second.
- **Boot Records** screen (`.../BootRecordsScreen.tsx`) — the persisted history the native side
  recorded, one row per finalized boot, fetched over the bridge (`FetchBootRecords`) and clearable
  (`ClearBootRecords`). This is the only place the native milestones and the matching web snapshot are
  shown together.

The two answer different questions: Boot is "how is this session doing right now"; Boot Records is
"how did the last N launches go".

## Opening the debug panel in PROD (one unlock)

The boot timeline is meant to be read on a PROD build, since that is where the problem it measures
actually reproduces:

1. Ten taps on the app version in the web My Page unlock web debug mode.
2. The web's `useDebugMode` sends `SetDebugMode` over the bridge; native persists it in
   `debugSettingsStore.debugModeEnabled` and re-injects `window.CHATIC_APP_DEBUG_MODE` on every load,
   so the flag survives an app restart and unlocks the web debug panel again without a second unlock.
3. Disabling debug mode from the web (`SetDebugMode: { enabled: false }`) locks it again.

Screens whose only job is to drive a native command (`requiresShell: true` in the debug panel's
catalog) render a "no shell" message instead of failing silently when opened outside the app — Boot
and Boot Records both work from a device build; only Boot Records needs the native bridge.

## Notes

- The boot path only does synchronous, minimal work (recording a timestamp); persisting and reporting
  happen asynchronously once the record finalizes.
- A milestone key is recorded only once per session — an SPA navigation re-firing a load event is
  ignored.
- WKWebView can report `transferSize: 0` for Resource Timing entries even on a real network fetch, so
  the cache heuristic also checks `decodedBodySize` and a `duration < 30ms` fallback — worth
  double-checking against a real device.
