# @chatic/runtime-web

**The web adapter for a browser-only page.** It fills the runtime's ports with what is true of a page and
of nothing else — the page's stores, its `navigator.onLine`, a socket opened by the page, IndexedDB — as
the adapters an app's runtime declaration plugs in. It never talks to a shell: no bridge request, no
vault, no shell database, no mirror. A page that also runs inside a shell (apps/web, apps/desktop-web)
declares [`@chatic/runtime-hybrid-web`](../runtime-hybrid-web/README.md), which re-exports this package
and adds the shell side (ADR-0376 decision 4). admin and the landing site declare this one.

```ts
const started = await startRuntime(declaration); // config, host ports, then the engine
```

No library chooses a page's ports for an app: a choice made here would be made for every app at once and
change only with a build, while a declaration is read by its own app alone (ADR-0343).

| Port                      | Filled by (`src/`)        | With                                                                                                              |
| ------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `RuntimePorts.transport`  | `webTransportPorts()`     | `navigator.onLine` and the window's online/offline events; `navigator.userAgent`; `new WebSocket(url, protocols)` |
| `RuntimePorts.auth`       | `webAuthPorts()`          | `location.search`; `location.replace('/?<params>')` at the end of a session                                       |
| `RuntimePorts.foreground` | `webForegroundPorts()`    | `document.visibilityState` and the document's `visibilitychange` event                                            |
| `RuntimePorts.db`         | `webLocalCachePorts(tab)` | every cache domain in IndexedDB, a tab's invited clouds in `tab` (`browserCachePorts`)                            |

### Each port on its own

| Port       | Factory (adapter id)                                      | Handed                                                                                        |
| ---------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| transport  | `webTransportPorts(options?)` (`transport.browser`)       | `appPlatform` reader; none by default                                                         |
| auth       | `webAuthPorts(location?)` (`auth.location`)               | the page's `location`                                                                         |
| foreground | `webForegroundPorts(source?)` (`foreground.visibility`)   | a document; the page's own by default                                                         |
| storage    | `tabStorageStores(areas)` (`storage.tab`)                 | the raw `webLocal`/`webSession` stores (`pageStorageAreas()`)                                 |
| storage    | `localStorageStores(areas)` (`storage.local`)             | the same                                                                                      |
| storage    | `vaultStorageStores({ ...areas, vault })`                 | a vault store and optionally where plain state goes; the vault itself is runtime-hybrid-web's |
| db         | `indexedDbCache(options?)` (`db.indexeddb`)               | an IndexedDB connection; the page's one shared connection by default                          |
| db         | `webStorageCache({ tab, importFrom })` (`db.web-storage`) | the raw tab store, and the store a tab's invited clouds are imported from once                |
| db         | `browserCachePorts({ indexedDb, webStorage? })`           | routes `invitecloud` to `webStorage` when handed, every other domain to IndexedDB             |

`webHostFacts()` answers `BROWSER_HOST_FACTS`: no bridge, no platform, no storage media, no runtime offer,
no capability declaration — what a plain tab reads from a host profile, without reading one.

### The adapters

The same factories as values a runtime declaration plugs in (see
[The runtime declaration](../runtime/docs/declare/README.md#the-runtime-declaration)). The barrel hands on
`defineRuntime`, `requires`, `conflicts`, `defineAdapter`, the module presets and the declaration types,
so a web app's declaration imports this package alone. Its `startRuntime` is runtime-client's with one
step first: it hands `webPlatform` to `@chatic/runtime` (`providePlatform`) — the page's address, no shell
bridge, and the user agent — so the headless runtime reads no DOM. `startRuntimeOn(platform)` builds the
same wrapper over another platform; runtime-hybrid-web's `startRuntime` is one.

| Export                 | Id                      | Builds                                                                          |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `transportBrowser`     | `transport.browser`     | `webTransportPorts()`                                                           |
| `authLocation`         | `auth.location`         | `webAuthPorts()`                                                                |
| `foregroundVisibility` | `foreground.visibility` | `webForegroundPorts()`                                                          |
| `storageTab`           | `storage.tab`           | `tabStorageStores(pageStorageAreas())`                                          |
| `storageLocal`         | `storage.local`         | `localStorageStores(pageStorageAreas())`                                        |
| `cacheIndexedDb`       | `db.indexeddb`          | every domain in IndexedDB                                                       |
| `cacheWebStorage`      | `db.web-storage`        | IndexedDB, plus a plain tab's invited clouds in the storage port's `webSession` |

Within one start the page's raw web stores are built once, by the storage adapter: the cache's tab rows
take that adapter's `webSession` (`tabStoreOf`) rather than opening their own. Where site data is
blocked each opening is a fresh memory store, so a second one would split the session from the cache's
tab rows.

`xhrPut` and `createXhrPut()` are `@chatic/data`'s `PutPort`, handed to `useSendImages`: the page's own
`XMLHttpRequest` PUT. `pageLinks` is the page's `openUrl` and `copyText`, for an app's `links` port; it lives in
[`@chatic/host-web-browser`](../host/web/browser/README.md) and is re-exported here.

What else still has a browser answer inside a package moves here as its wiring becomes a port:

- `@chatic/auth` — at logout, the tokens a run without the vault left in the tab's `sessionStorage`
  (`WebStore.session()` in `session/relaySession.ts`); a no-op outside a page.
- `@chatic/http` — its own `navigator.onLine` read for failure attribution; it sits below transport,
  so it cannot read the transport's online port.

## Rules

- Tagged `layer:adapter` and `platform:web`: it may not import `@chatic/runtime-react` (the React
  binding), React, or React Native. It imports `@chatic/runtime/platform` alone from the headless
  runtime, to hand its platform in. See [the layers](../runtime/docs/engine/README.md#layers).
- It imports `@chatic/bridges` for types only and never imports `@chatic/runtime-hybrid-web`; its lint
  config holds both. A page that runs inside a shell declares runtime-hybrid-web.
- Nothing in the runtime imports it. An app's declaration and entry point do, and `startRuntime` passes
  what the declared adapters build into the assembly.
- It holds the readers, not their meaning: what an `online` false means for the link, or which
  platform a user agent is, stays in the package that declared the port.
- Its tests run in jsdom, because these are a page's readers (`src/transport.spec.ts`).

## Constraints the adapters keep

- **A browser page has no shell platform.** `webTransportPorts()` and `webPlatform` read none; a page that
  may run in a shell takes runtime-hybrid-web's, which read it from the host profile rather than the app's
  device store (filled by a React hook on mount, after the first socket may open).
- **Outside a page the readers answer "fine", never "broken".** Without `navigator` the link reads as
  online (weak evidence, which the link verdict already treats as such), and without a `document` the
  foreground signal says "in front" and never changes: a retry that waits for a return it cannot observe
  would wait forever.
- **A session ends with `location.replace`, not `assign`**, so the history keeps no signed-in entry to
  go back to; the next document's boot reads the `logout=1` it carries.
- **`copyText` rejects where the Clipboard API is missing** (a non-secure context, an old WebView)
  instead of answering `false`, so a caller with its own fallback can tell "no clipboard" from "the copy
  failed".
- **`xhrPut` leaves out the headers a browser owns** (`content-length`, `host`): `XMLHttpRequest`
  refuses to set them and fills them from the request itself, which is the value that was signed.
  Its timeout bounds the whole PUT and scales with size (at least five minutes, otherwise what a 1 Mbps
  uplink needs), so a large video is not cut off halfway and then resent whole into the same limit.
  Progress is wired only when asked. A CORS refusal lands in `onerror` and cannot be told from a dropped
  connection; both get the same retry.
- **Specs that touch IndexedDB install the shim before importing the ports** (the adapter opens a real
  database in its constructor). To get a fresh capability snapshot, use `jest.resetModules` with
  `jest.requireMock`: a dynamic `import()` of a library marks it lazy-loaded and turns every static
  import of it into a module-boundary lint error.
- **The socket lib and `uuid` need two things under jest**: `TextEncoder`/`TextDecoder`, which the shared
  jsdom environment in `tools/jest/` provides (ADR-0371), and a transform for `uuid`, which ships ESM only.
