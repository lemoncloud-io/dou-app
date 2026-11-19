> Korean: [README.ko.md](./README.ko.md). This English version is the canonical one.

# chatic-apps-devtools

The verifier for a Chatic app page (a mini-app built with `chatic-apps-sdk`). An author runs one command,
`verify`, before handing the page over: it checks the page and tries its build against a stand-in for the
app, then says what is wrong and how to fix it, in plain words. Nothing here is part of the page; the
page's only runtime dependency stays the SDK.

## `verify`

Add it to the project's scripts and run it after building:

```json
{ "scripts": { "verify": "chatic-apps verify" } }
```

```bash
npm run build
npm run verify
```

Or, without a script, by the package's full name: `npx @lemoncloud/chatic-apps-devtools verify`. Never a
bare `npx chatic-apps`: outside a project that has this package installed, npm would fetch whatever
package owns that name, which is not this one.

```text
Chatic app check

✓ Manifest
✗ Permissions
  • The page uses something that needs "share", and does not ask for it (src/app.ts:212) → add "share" to the manifest's permissions
✓ Code
✓ Bundle
✓ Starting up
✓ Back and close
…

Screen checks were skipped: add chatic-apps.scenarios.ts to try each screen's back and clean-up.
Bundle: 4 files, 23.0 KB.

✗ 1 thing(s) to fix.
```

- **One line per thing to fix**: what is wrong → how to fix it, with the file and line, or the screen.
  A group with nothing to fix folds into one ✓ line.
- **English or Korean**, following the system's language (`LC_ALL`, `LC_MESSAGES`, `LANG`); `--lang en`
  or `--lang ko` chooses.
- **`--details`** adds the rule or scenario behind each line; **`--json`** prints everything as data.
- **The build folder is `dist/`** unless `--dist` names another; `--root` is the project's folder.
- **No setup needed.** Without a scenario file it runs the behaviour checks that need no screens (start,
  back at the root, close, theme, hiding and coming back, a refused consent, a cloud change, a rate
  limit, and a turn of the phone for an `immersive` page) and says that a scenario file adds the screen checks. Not built yet, it says to build first.
- Exits `0` when there is nothing to fix, `1` when there is.

The package is not published yet. Its publish manifest is `package.publish.json` (as
`@lemoncloud/chatic-apps-devtools`, command `chatic-apps`); it ships once the SDK's release path moves to
CI publishing with provenance, because a command that runs on authors' machines is worth more to an
attacker than a library.

## `bundle`

`chatic-apps bundle` packs the build folder into the zip that is handed over: its contents at the top of
the archive (`index.html`, `.well-known/chatic-app.json`, `assets/…`) and nothing else. Add it as the
project's `bundle` script, as `verify`; it writes `<project folder>.zip` unless `--out` names another
file, refuses a folder that is not built or holds a link, and packs the same build to the same bytes —
entries sorted and dated 1980-01-01. It checks nothing else: run `verify` first.

## Inside: `check` and `scenarios`

`verify` is the checker followed by the scenario runner. Both stay as commands of their own, for CI and
for anyone who wants their raw output with rule names:

```bash
npx nx build @chatic/chatic-apps-devtools          # into dist/libs/chatic-apps-devtools
node dist/libs/chatic-apps-devtools/cli.js verify    --root <page> [--dist <built folder>]
node dist/libs/chatic-apps-devtools/cli.js check     --root <page> --dist <built folder>
node dist/libs/chatic-apps-devtools/cli.js scenarios --root <page> --dist <built folder> [--mock <module>]
```

Each exits `1` when something fails, `0` when it passes, and prints `--json` on request. The plain
messages `verify` prints live in `src/i18n/` (`en.ts`, `ko.ts`), keyed by every rule and every scenario
issue, so a rule added without its message does not compile.

The tools are proven on a reference mini-app that is kept outside this repository, as a page author's own
project would be: it installs this package and the SDK as packages, passes `verify`, and its tests break
it on purpose — once per checker rule, and for each scenario a page commonly gets wrong — to show each
check catches its case. This repository holds no page of its own.

### `check`

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
`data.sendMessage`, `data.react`, `data.session`, the place profile helpers), looked for only in files that import the
SDK or its types, and from quoted data method names, each
mapped to its permission by a table that is keyed by the SDK's own `DataCalls` and `DataStreams` types —
a method the SDK adds or drops fails to compile here.

**Network targets** are listed, never failed: each `fetch`, `WebSocket`, `EventSource`,
`XMLHttpRequest.open`, `sendBeacon`, `axios` and remote `import()` in the source, and every host written
out in the bundle's scripts (which is where a third-party library's calls show). The app does not filter
what a page reads from the cloud, so what a page sends where is its author's to review.

**The bundle's size** is printed by file type, for the author and the release record.

### `scenarios`

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
| `cloud-change`    | A stream stays open, a page that had one open does not react, or it keeps sending data requests                                                       |
| `big-list`        | A screen draws more than 2,000 elements for lists of 5,000 rows                                                                                       |
| `rate-limited`    | A read refused with `RATE_LIMITED` is never tried again                                                                                               |
| `rotation`        | An `immersive` page throws or reports an error when the phone turns and turns back (its insets change); it runs only for an `immersive` manifest      |

Errors are what the page throws (synchronously, in an event listener, or as an unhandled rejection) and
what it reports through `reportError`. Streams are counted on the wire: subscribed and answered, minus
unsubscribed and ended by the app. Listeners are counted on the window, the document and other objects
that outlive a screen; an element's own listeners go with the element and are not counted.

A scenario that does not apply — no data permission, no screens or no actions declared — reports that
it did not run.

#### The scenario file

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
`@chatic/chatic-apps-sdk/mock`, the SDK's name inside this workspace.

## The API

`verify`, `formatVerify` and `bundle` are the commands' API. `check`, `runScenarios`, `loadDist`, `loadEntry`,
`openPage` and `loadScenarioConfig` are exported for tests. `loadEntry` bundles a page from its sources as a production build would (`import.meta.env.DEV`
false) with an optional source transform, which is how a page's own tests make broken copies of it;
`openPage` opens a page with a hook to put a host — the mock, or a real one — in place first. `openMockedPage` opens one with the SDK's mock already in place, given the mock's options — a
context of the test's choosing, `display: 'immersive'`, or no `display` and `safeArea` for an older app —
and hands back the mock's controller as `app`.

The build writes one declaration file for this API, `index.d.ts`, beside `index.js` and `cli.js`.

## Tests

The tests here hold the parts that need no page: the comment stripping the code rules read through, the
permission table against the SDK's methods, every message in both languages, the language choice, the
scenarios run without a scenario file, the printed format, `verify` on an empty folder, and this README
against its Korean pair (`README.ko.md`: the same headings and code blocks, each pointing at the other —
the SDK's own pairing check). The checks themselves are tried on the reference mini-app, outside this
repository.

A test runner (jest, `node --test`) takes an unhandled rejection from the page for itself and fails the
test, so that case is never seen by the runner under one; the command, in plain Node, reports it as a
problem.
