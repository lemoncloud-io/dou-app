# @chatic/bridge-host

**The shell side of the WebView bridge: the part that receives a page's requests and answers them.**
A shell — `apps/mobile`, `apps/desktop`, or the fake shell `apps/web-e2e` runs in Node — builds one
`AppBridgeHost`, registers a handler per message, and pushes events to the page through it.

| Export                                                | What it is                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `AppBridgeHost` · `IAppBridgeHost`                    | handler routing, the `WebAppReady` handshake, `Ping`, the event buffer until the page is ready |
| `JsonProtocol` · `MessageProtocol`                    | the JSON framing both sides encode and decode with                                             |
| `MessageQueue` · `IMessageQueue`                      | the FIFO the host and the client buffer messages in                                            |
| `RequestMessage` · `ResponseMessage` · `EventMessage` | the envelope names over `@chatic/bridge-messages`' types                                       |
| `BRIDGE_VERSION` · `BRIDGE_VERSION_INFO`              | the protocol version stamped on every message and sent in the handshake                        |

The framing, the queue and the version are here rather than in the client because both sides need
them and the host must not depend on page code: the dependency runs one way, client → host.
`src/boundary.spec.ts` fails if a file here imports `@chatic/bridge-client` or `@chatic/bridges`.
Nothing here touches `window` or React Native, so the same host runs in a phone, in Electron's main
process and in a Node test.

Imports: `@chatic/bridge-messages` (types and `WEB_MESSAGE_RESPONSE_TYPE`) and `@chatic/logger`.

How a request travels, the handshake, the failure codes and when to bump `BRIDGE_VERSION` are
written once for both sides, in [`libs/bridges/README.md`](../../bridges/README.md) — see
[The two ends](../../bridges/README.md#the-two-ends) and [Versioning](../../bridges/README.md#versioning).
The message vocabulary is [`@chatic/bridge-messages`](../../bridge-messages/README.md).

```bash
npx tsc -b libs/bridge/host/tsconfig.json --force
(cd libs/bridge/host && npx jest)
```
