# @chatic/bridge-client

**The page side of the WebView bridge: the part that asks the shell for something and waits for the
answer.** A web runtime (`apps/web`, `apps/desktop-web`, `apps/admin`) uses the one `webClient`, and
reads what the shell injected at boot through the host profile.

| Export                                                                                             | What it is                                                                                  |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `webClient` · `WebBridgeClient` · `IWebBridgeClient`                                               | request/reply matching, readiness polling, timeouts that count only visible time            |
| `NativeBridgeAdapter` · `InMemoryAdapter` · `BridgeAdapter`                                        | the WebView channel, and a loopback to an `IAppBridgeHost` for contract tests               |
| `isNative()`                                                                                       | whether a shell channel is on `window`                                                      |
| `hostProfile()` · `buildHostProfile` · `liveShellGlobals` · `liveShellValue` · `resolveCapability` | what the shell injected: boot globals, storage media, runtime offer, capability declaration |
| `BridgeStorageChannel` · `shellKeepsStorageMedium`                                                 | the storage requests (`StorageGet` · `StorageSave` · `StorageClear`)                        |
| `setupBridgeLogger` · `createNativeForwarder` · `toAppLogInfo` · `toLogEntry`                      | the web→native log relay                                                                    |

The host profile reads globals a shell put on `window`, so it is page code even though its folder is
called `host/`. Only this package and the debug overlay may read those globals
(`@nx/workspace-host-facts`); everything else goes through the host ports.

Imports: `@chatic/bridge-host` (framing, queue, version, `IAppBridgeHost`), `@chatic/bridge-messages`
and `@chatic/logger`. The host package never imports this one.

How a request outruns its channel, the timeouts, the host profile and the scenarios are written once
for both sides, in [`libs/bridges/README.md`](../../bridges/README.md) — see
[The host profile](../../bridges/README.md#the-host-profile) and
[Scenarios](../../bridges/README.md#scenarios).

```bash
npx tsc -b libs/bridge/client/tsconfig.json --force
(cd libs/bridge/client && npx jest)
```
