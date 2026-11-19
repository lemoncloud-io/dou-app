# chatic-apps-devtools

Development tools for a Chatic app page (a mini-app built with `chatic-apps-sdk`): a **checker** and a
**scenario runner**, as one command with two subcommands. They run on the author's machine, before the
page is handed over; nothing here is part of the page. The page's only runtime dependency stays the SDK.

The package is not published yet. Its publish manifest is `package.publish.json` (as
`@lemoncloud/chatic-apps-devtools`, command `chatic-apps`); it ships once the SDK's release path moves to
CI publishing with provenance, because a command that runs on authors' machines is worth more to an
attacker than a library.

```bash
npx nx build @chatic/chatic-apps-devtools          # into dist/libs/chatic-apps-devtools
node dist/libs/chatic-apps-devtools/cli.js check     --root <page> --dist <built folder>
node dist/libs/chatic-apps-devtools/cli.js scenarios --root <page> --dist <built folder> [--mock <module>]
```

Both exit `1` when something fails, `0` when it passes, and print `--json` on request. The reference
mini-app (`apps/chatic-apps-example`) runs both as its `check` and `scenarios` targets.

## `check`

Reads the manifest, the source (`src/`, and `index.html`) and the built bundle (`dist/` by default). It
never runs the page.

| Rule                          | What it holds                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `manifest/missing`            | There is a `.well-known/chatic-app.json` (the bundle's copy wins over `public/`) |
| `manifest/invalid`            | It is a JSON object, and `permissions` an array                                  |
| `manifest/version`            | `manifestVersion` is `1`                                                         |
| `manifest/name`               | `name` is 1 to 100 characters                                                    |
| `manifest/unknown-field`      | Every field is one the app reads                                                 |
| `manifest/unknown-permission` | Every permission is one the app knows                                            |
| `manifest/display`            | `display` is `clean`, `titled` or `immersive`                                    |
| `manifest/orientation`        | `orientation` is `any`, `portrait` or `landscape`                                |
| `manifest/unused-permission`  | Every permission asked for is used somewhere in the source                       |
| `manifest/missing-permission` | Every call that needs a permission has it                                        |
| `code/unknown-data-method`    | A quoted cloud data method name is one the SDK types                             |
| `code/local-storage`          | No `localStorage`                                                                |
| `code/os-theme`               | No `prefers-color-scheme`, in code or CSS                                        |
| `code/history-routing`        | No `pushState`/`replaceState`, hash routes, `popstate`, browser or hash routers  |
| `code/popup`                  | No `window.open` or `window.opener`                                              |
| `code/version-compare`        | No comparison of `appVersion`/`protocolVersion`                                  |
| `code/error-message`          | No branching on an error's `message`                                             |
| `bundle/missing`              | The bundle folder exists                                                         |
| `bundle/layout`               | `index.html` and the manifest at its top, and `index.html` is the built one      |
| `bundle/build-output-only`    | No sources, source maps, package files or dotfiles in it                         |
| `bundle/mock`                 | The SDK's mock is not in the production bundle                                   |

The code rules read the source with its comments blanked out, so a comment naming what a rule forbids
does not trip it. They are patterns, not a parser: they can miss a violation written unusually, and a
string that merely mentions a forbidden name can trip them.

**Permissions in use** come from the calls that need them (`copy`, `share`, `openUrl`, `getUserKey`,
`data.sendMessage`, `data.session`, the place profile helpers), looked for only in files that import the
SDK or its types, and from quoted data method names, each
mapped to its permission by a table that is keyed by the SDK's own `DataCalls` and `DataStreams` types —
a method the SDK adds or drops fails to compile here.

**Network targets** are listed, never failed: each `fetch`, `WebSocket`, `EventSource`,
`XMLHttpRequest.open`, `sendBeacon`, `axios` and remote `import()` in the source, and every host written
out in the bundle's scripts (which is where a third-party library's calls show). The app does not filter
what a page reads from the cloud, so what a page sends where is its author's to review.

**The bundle's size** is printed by file type, for the author and the release record.

## `scenarios`

Opens the built page against the SDK's mock of the app and plays what a user and the app do to it. It
runs with no browser: [jsdom](https://github.com/jsdom/jsdom) for the window and esbuild to turn the
page's ES module scripts into one classic script, since jsdom does not run modules. That keeps the
install to two packages and no browser download; the cost is that nothing is laid out or painted, so
layout, the safe area and real touch are not tried here. The runner never reaches the app or a server.

| Scenario          | Fails when                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`           | The page throws, never connects, never calls `apps.data.connect()` with a data permission, or takes back at its root                                  |
| `screens`         | A screen does not take Android back, back does not return to the root, or a stream, a listener on a lasting object, or an interval is left after back |
| `back-at-root`    | Android back at the root does not close the page                                                                                                      |
| `close-guard`     | A second close within three seconds does not close                                                                                                    |
| `theme`           | The page does not change when the app's theme does                                                                                                    |
| `hide-resume`     | A page that uses storage does not save when hidden, or breaks when shown again                                                                        |
| `actions`         | An action throws or reports an error                                                                                                                  |
| `device-refused`  | An action throws or reports an error with the camera and microphone blocked                                                                           |
| `consent-refused` | The page throws, or asks again, when the user refuses the cloud's data                                                                                |
| `cloud-change`    | A stream stays open, the page does not react, or it keeps sending data requests                                                                       |
| `big-list`        | A screen draws more than 2,000 elements for lists of 5,000 rows                                                                                       |
| `rate-limited`    | A read refused with `RATE_LIMITED` is never tried again                                                                                               |

Errors are what the page throws (synchronously, in an event listener, or as an unhandled rejection) and
what it reports through `reportError`. Streams are counted on the wire: subscribed and answered, minus
unsubscribed and ended by the app. Listeners are counted on the window, the document and other objects
that outlive a screen; an element's own listeners go with the element and are not counted.

A scenario that does not apply — no data permission, no screens or no actions declared — reports that
it did not run.

### The scenario file

The runner learns the page's screens and its data from `chatic-apps.scenarios.ts` (or `.mts`, `.js`,
`.mjs`) at the project's root. Its default export:

```ts
import type { ScenarioConfig } from '@lemoncloud/chatic-apps-devtools';

import { mockData } from './src/mockData';

export default {
    data: mockData, // what the mock answers: the page's own development data
    ready: '[data-action="done"]', // present once the page has started
    screens: [
        { name: 'rooms', open: ['[data-action="rooms"]'] }, // each click opens one screen
        { name: 'members', open: ['[data-action="members"]'], tap: ['[data-action="member"]'] },
    ],
    actions: [{ name: 'share', click: '[data-action="share"]' }],
} satisfies ScenarioConfig;
```

The permissions come from the bundle's manifest. The mock is imported from the project's own installed
SDK (`@lemoncloud/chatic-apps-sdk/mock`); `--mock` names another module, as this repository does with
`@chatic/chatic-apps-sdk/mock`.

## The API

`check`, `runScenarios`, `loadDist`, `loadEntry`, `openPage` and `loadScenarioConfig` are exported for
tests. `loadEntry` bundles a page from its sources as a production build would (`import.meta.env.DEV`
false) with an optional source transform, which is how this package's tests make broken variants of the
reference mini-app; `openPage` opens it with a hook to put a host in place first. The app's host
conversation test (`apps/mobile/src/app/subWebView/chaticAppsSdkRuntime.contract.test.ts`) uses the same
two to run the reference mini-app against the app's real page host.

## Tests

`check.test.ts` passes the reference mini-app, then breaks it once per rule — every rule has a variant,
and a test fails when a rule is added without one. `scenarios.test.ts` passes it through every scenario,
then breaks it for each: screens without back, a stream left open, a listener and an interval left
behind, a whole list drawn, no save on hide, no theme, asking again after a refusal, ignoring a cloud
change, no retry, back taken at the root.

Jest replaces `process` inside a test, so an unhandled rejection from the page fails the jest test
itself rather than reaching the runner; the command, in plain Node, reports it as a problem.
