# storage — what the shell keeps on the device

The WebView holds no durable state of its own. Everything that has to survive a reload, a restart,
or a lost connection is owned by the shell, and this category describes **the engines and the domain
data sources over them.**

A document belongs here if it is about bytes the shell persists on behalf of the web client. The
messages that carry those bytes across the boundary are in
[../webview/README.md](../webview/README.md); the service lifecycle around them is in
[../native/service.md](../native/service.md).

| Document               | Owns                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------- |
| [cache.md](./cache.md) | SQLite and MMKV, the per-domain data sources, and the cache messages the WebView sends |

It is a recovery story: the app is killed at any moment, and what is on disk is what is left.

File transfer is not here although it outlives a screen — it deliberately persists nothing, because
the signed URL it carries is a credential that expires. It is described with the other native
modules in [../native/file-transfer.md](../native/file-transfer.md).
