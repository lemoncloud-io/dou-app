# boot — what runs before the first pixel

Boot in this shell is serial: the WebView is the entire product surface, so every native step ahead
of WebView instantiation is time the user spends on a blank screen. This category owns **what is
allowed on that critical path, and how the cost is measured on-device.**

A document belongs here if it is about work happening _before_ the WebView is interactive. Once the
WebView is loading, the subject moves to [../webview/README.md](../webview/README.md); the services
that boot constructs are described in [../native/service.md](../native/service.md).

| Document                                       | Owns                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [boot-optimization.md](./boot-optimization.md) | The critical path, what is deferred and why, and the rules that keep new work off it                                       |
| [boot-metrics.md](./boot-metrics.md)           | `BootMetricsService` — the timeline marks, the MMKV ring buffer, and how to read a record                                  |
| [boot-splash.md](./boot-splash.md)             | What covers the screen until the first web screen paints — the held launch splash, the web handoff, the crash-reload cover |

The first two are a pair: `boot-optimization.md` states the budget, `boot-metrics.md` is how you find
out whether you are still inside it. `boot-splash.md` is what the user is looking at meanwhile.
