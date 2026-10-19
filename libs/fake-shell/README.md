# @chatic/fake-shell

**A native shell for the web app, minus the WebView.** The mobile app's own `AppBridgeHost` with a
typed table of fake handlers in place of the native ones, an in-memory stand-in for the app's SQLite
cache, the answers every app build gives at boot, and a guard around the app's own boot script. A
caller supplies the transport — how a message reaches the page and how the page's posts come back.

Two callers, and only these two:

| Caller                                                     | Uses                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [`apps/web-e2e`](../../apps/web-e2e/README.md)             | The core, with a Playwright transport: `page.exposeFunction` in, `page.evaluate` out    |
| [`apps/shell-adapter`](../../apps/shell-adapter/README.md) | The handler tables only (`bootHandlers`, `MemoryCache`), as the virtual shell's answers |

**Product code never imports this.** It is not in the `@chatic/bridges` barrel, which ships in the web
and the app, and nothing outside the two callers may depend on it. No lint rule enforces that; it is
checked by searching for the import outside the two callers when this library changes. One core rather than two copies is
the point: when a message's contract changes, a second copy would follow it in one place and not the
other.

## What is in it

| File              | Holds                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shellCore.ts`    | `ShellCore`: the host, the handler table, what the page sent (`received`, `waitFor`), what was dispatched (`delivered`), requests nobody answers (`unhandled`), the boot script's own failure reports, `observe`, `reboot` |
| `handlerTable.ts` | `ShellHandler<K>`, `ShellHandlerTable`, `ShellFailure`, `toHostHandler`                                                                                                                                                    |
| `memoryCache.ts`  | `MemoryCache`: the cache messages answered from memory, with the part of the app's query semantics the web relies on                                                                                                       |
| `bootHandlers.ts` | `bootHandlers(platform)`: what every app build answers at boot; `ShellPlatform` and where each platform dispatches                                                                                                         |
| `appInjection.ts` | `AppInjectionParams` and `guardAppInjection`: the app's boot script builder, refusing a script that leaves a global `undefined`                                                                                            |

## The handler table is typed against the contract

A handler returns the payload of the reply `WEB_MESSAGE_RESPONSE_TYPE` pairs with its request
(`ShellReply<K>`); the reply's `type` is filled in from that map, never by the handler. Renaming a
reply or changing its payload in `@chatic/app-messages` therefore breaks every table that answers it —
the e2e fixtures and the virtual shell's handler module alike — at compile time, instead of leaving a fake that answers
a contract the app no longer speaks. `ShellFailure` answers `success: false` with a domain code;
leaving a type out answers the host's own `NOT_FOUND`, which the web reads as an app built before
that message.

## The transport

```ts
interface ShellTransport {
    deliver(raw: string): Promise<boolean> | boolean;
}
```

`true` once the reply was dispatched in the page; `false` when the page is gone (navigated or closed
between request and reply), which the real shell drops too. Anything else is thrown, and recorded in
`deliveryErrors` — a shell that cannot answer would otherwise only show as the web's own bridge
timeout. The page's posts go to `receive(raw)`.

`reboot()` starts a new host with the same handlers: what an app relaunch is to the bridge. The new
host holds pushed events again until its page sends anything but a log line (`ready` says whether it
still holds them), and `received` and `delivered` start over with it. A reply the old host sends late —
an answer that waited on a person — is dropped, as a killed app's is, instead of reaching the next
launch's page. State a caller keeps across relaunches (the cache, settings) lives in its handlers, so
it survives.

`observe(observer)` hands every crossing, both ways, to a caller that records it; an observer that
throws is logged and skipped, never allowed to keep a message from the host. A long-lived caller that
keeps its own bounded record passes `retainTraffic: false`, and the core then keeps none of the
traffic (`received`, `waitFor`, `delivered` and `unhandled` are for tests). The host's own answers —
the handshake and the `Ping` probe — count as handled.

## The app's boot script

`guardAppInjection(module)` wraps `getSyncInjectionScript` from
`apps/mobile/src/app/webview/utils/injectionScripts.ts`. Each caller loads that module without a
static import — the e2e suite from a computed path at run time —
because an import would make `@chatic/mobile` a dependency of the caller's project, and typechecking it
would then build the mobile app (red, and outside CI). What that costs is the compile-time check of the
arguments against the app's parameter type; the guard refuses a script that assigns `undefined` to a
global, and the script itself reports a failure inside it through the bridge (tag `INJECTION`), which
`ShellCore` records in `injectionErrors`. When the app's parameters change, `AppInjectionParams` has to
follow.

Tests: `npx nx run @chatic/fake-shell:test`.
