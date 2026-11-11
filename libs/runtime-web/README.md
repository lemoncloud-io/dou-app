# @chatic/runtime-web

**The web adapter: what fills the runtime's ports in a web page.** The browser and the desktop shell
run the session, the sockets, sync and the data layer in the page. This package will hold the pieces
that are true of a page and of nothing else — the page's stores, its `navigator.onLine`, a
socket opened by the page — and hand them to the runtime as a
[`RuntimePorts`](../runtime-core/README.md).

| Export                | Fills                    | With                                                                                                                                               |
| --------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webTransportPorts()` | `RuntimePorts.transport` | `navigator.onLine` and the window's online/offline events; `window.CHATIC_APP_PLATFORM` and `navigator.userAgent`; `new WebSocket(url, protocols)` |
| `webAuthPorts()`      | `RuntimePorts.auth`      | `location.search`; `location.replace('/?<params>')` at the end of a session                                                                        |

The four apps that boot the runtime — web, desktop-web, admin and the landing site — pass it to
`initAppRuntime({ transport, auth })` from their entry point. The session's storage is not here: each app
already chooses its stores in one place of its own (`resolveStorageStores()` in web and desktop-web, a
stores module in admin and the landing site).

What else still has a browser answer inside a package moves here as its wiring becomes a port:

- `@chatic/auth` — at logout, the tokens a run without the vault left in the tab's `sessionStorage`
  (`WebStore.session()` in `session/relaySession.ts`); a no-op outside a page.
- `@chatic/app-runtime` — the runtime's own device/tab stores, which default to the page's storage.
- `@chatic/http` — its own `navigator.onLine` read for failure attribution; it sits below transport,
  so it cannot read the transport's online port.

## Rules

- Tagged `layer:adapter` and `platform:web`: it may not import `@chatic/app-runtime` (the React
  surface), React, or React Native. See [the layers](../runtime-core/README.md#layers).
- Nothing in the runtime imports it. An app's entry point does, and passes what it builds into the
  assembly.
- It holds the readers, not their meaning: what an `online` false means for the link, or which
  platform a user agent is, stays in the package that declared the port.
- Its tests run in jsdom, because these are a page's readers (`src/transport.spec.ts`).
