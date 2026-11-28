# @chatic/mini-app-host

**What a shell decides about a mini app page before it lets the page in**: whether a URL is a
reviewed page (`isAllowedSubWebViewUrl`, over `SUB_WEBVIEW_DOMAINS`), and what the page's manifest
grants it (`/.well-known/chatic-app.json`, read by `parseSubWebViewManifest`, fetched by
`fetchSubWebViewManifest` and cached per origin by `createSubWebViewManifestStore`). The rules
underneath — trust tiers, data limits, display names — are
[`@chatic/mini-app-protocol`](../protocol/README.md)'s.

Tags: `layer:core-lib` · `platform:any` · `formfactor:any`. A core lib, not foundation: these are
the shell's own decisions built on the protocol, not wire vocabulary, and nothing below the apps
needs them. It touches no platform: the manifest fetch takes `fetch` and a logger as arguments, so
React Native, Electron's main process and Node can each pass their own. The React Native wiring —
the `SubWebViewService` that holds the open view, the page's MMKV storage, the screens — stays in
`apps/mobile`, which re-exports this package from `services/subWebView`. The Electron wiring — the
window, its chrome, the IPC and the page's own bridge host — stays in `apps/desktop`
(`src/main/subWebView/`), whose main bundle aliases this package and the protocol by path.

| Export                                          | Does                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `SUB_WEBVIEW_DOMAINS`, `isAllowedSubWebViewUrl` | the `reviewed` tier: one label under the pages' domains                                                 |
| `parseSubWebViewManifest`                       | a version-1 manifest to permissions, runtime permissions, display, orientation; anything else to `null` |
| `fetchSubWebViewManifest`                       | reads the manifest with a 3-second limit and a 16 KiB cap, on the page's own origin only                |
| `createSubWebViewManifestStore`                 | one fetch per origin at a time; keeps the last good manifest, refreshes it behind each later read       |
| `DEFAULT_SUB_WEBVIEW_MANIFEST`                  | what a page gets with no manifest: no permissions, `clean`, any orientation                             |

The desktop shell's sub window decides with its own set, in `src/desktop/`:

| Export                                       | Does                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `DESKTOP_SUB_WEBVIEW_OPEN_SCOPE`             | `anyHttps`: what the desktop handshake tells the web it opens                                            |
| `checkDesktopSubWebViewOpen`                 | an open request to its tier, origin, title and params, or `INVALID` / `NOT_ALLOWED`                      |
| `decideDesktopSubWebViewNavigation`          | `load` on the opened origin, `external` (OS browser) for another https origin, `block` for anything else |
| `allowsSubWebViewFrame`                      | frames load `https`, `about`, `data` and `blob` only                                                     |
| `acceptsSubWebViewMessage`                   | a message counts only from the main frame while it shows the opened origin                               |
| `readDesktopSubWebViewManifest`              | a version-1 manifest's `name` and `display`, `immersive` read as `clean`                                 |
| `fetchesManifest`, `displayOf`, `barTitleOf` | an `external` site gets no manifest fetch, the bar always, and its host as the title                     |

These differ from the phone's rules on purpose and are not merged with them: the phone's navigation
also hands `http`, `mailto`, `tel`, `sms` and store links to the OS, and it reads the whole manifest
(permissions, runtime permissions, orientation) through `parseSubWebViewManifest`, while the desktop
window hands only other https and http origins to the browser and reads only the name and the display,
granting no permissions.

A manifest that cannot be read, or a fetch that is redirected off the page's origin, falls back to the
default and is logged with `warn`. A timeout or a network failure is transient: the store keeps the
manifest it had for that origin instead of dropping to the default.
