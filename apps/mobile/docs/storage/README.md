# storage — what the shell keeps on the device

The WebView holds no durable state of its own. Everything that has to survive a reload, a restart,
or a lost connection is owned by the shell, and this category describes **the engines, the domain
data sources over them, and the transfers that outlive a single screen.**

A document belongs here if it is about bytes the shell persists on behalf of the web client. The
messages that carry those bytes across the boundary are in
[../webview/README.md](../webview/README.md); the service lifecycle around them is in
[../native/service.md](../native/service.md).

| Document | Owns |
| --- | --- |
| [cache.md](./cache.md) | SQLite and MMKV, the per-domain data sources, and the cache messages the WebView sends |
| [upload.md](./upload.md) | The native upload engine and the SQLite task state that makes an interrupted transfer recoverable |

Both are recovery stories: the app is killed at any moment, and what is on disk is what is left.
