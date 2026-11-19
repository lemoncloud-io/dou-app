# chatic-apps-example

The reference mini-app: one small Chatic app page that uses each feature of `chatic-apps-sdk` once,
written the way the SDK's guide says to. It is three things at once:

- **The example a new page starts from.** Copy the folder, change the manifest and the screens.
- **What the tools run against.** `chatic-apps check` and `chatic-apps scenarios`
  (`libs/chatic-apps-devtools`) must pass it, and their tests break it on purpose to show each checker rule, and
  each scenario a page commonly gets wrong, fails.
- **What the app's host conversation test runs.** `chaticAppsSdkRuntime.contract.test.ts` in
  `apps/mobile` builds this page from its sources and runs it against the app's real page host, from the
  handshake to `finish`. A request the SDK renames breaks that test.

So every control has a `data-action` name and every value the tests read a `data-field` name.

## Commands

```bash
npx nx dev chatic-apps-example        # in a browser, with the SDK's mock as the app (port 5180)
npx nx build chatic-apps-example      # dist/apps/chatic-apps-example
npx nx bundle chatic-apps-example     # dist/apps/chatic-apps-example.zip: the submission bundle
npx nx check chatic-apps-example      # the checker, on the build
npx nx scenarios chatic-apps-example  # the scenario runner, on the build
```

The bundle is the built folder zipped with its contents at the top — `index.html`,
`.well-known/chatic-app.json`, `assets/…` — and nothing else, by `scripts/zip-bundle.mjs` (plain Node, no
packages, entries sorted and dated 1980-01-01 so a build always packs to the same bytes). Where a bundle
goes after that — upload, review, hosting under `*.apps.chatic.io` — is not set up yet.

## What it uses, and where

| Feature                                                                                                    | Where                          |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `connect`, `ChaticAppsError` codes, the mock in development only                                           | `src/main.ts`                  |
| `context.theme`, `onContextChange`                                                                         | `startApp`, `applyTheme`       |
| A screen stack: `onBack` while a screen is stacked, a back button                                          | `open`, `back`, `syncBack`     |
| `onCloseRequest` for an unsent draft only                                                                  | `syncCloseGuard`               |
| `storage.get`/`set`/`remove`/`usage`, saving on `visibilitychange`                                         | Counter, `save`                |
| `haptic`, `copy`, `link`, `share`, `openUrl`, `getUserKey`                                                 | Device section                 |
| `permissions.query`/`request`, `openSettings` when blocked                                                 | Camera button                  |
| `setTitle`, `reportError` for the page's own bugs, `finish(result)`                                        | `startData`, `failed`, Done    |
| `data.connect` with `CONSENT_REFUSED`, `can`, `session`, `onSessionChange`, `onCloudChanged`               | `startData`                    |
| `data.call`: `cloud.getCloud`, `place.cacheReadList`, `chat.cacheReadList`, retried once on `RATE_LIMITED` | `startData`, `readPlace`, room |
| `data.subscribe('channel.observeList')`, stopped when the screen leaves                                    | Rooms screen                   |
| `data.sendMessage` on the user's tap                                                                       | Room screen                    |
| `myProfile`, `observeMyProfile`, `placeProfiles`, `placeProfile`, `observePlaceProfile`                    | Members screen                 |

Lists keep and draw at most 30 rows: an event can carry a whole list, and the scenario runner gives the
page 5,000.

## Rules this page keeps

- **Made-up data only.** `src/mockData.ts` is invented — ids, names, messages. Never a real cloud's.
- **Its manifest asks for every permission because it uses every feature.** A real page asks for the
  fewest that do its job; the checker fails a permission the source never uses.
- **No network calls of its own**, so the checker lists no network targets for it.
- **Imports `@chatic/chatic-apps-sdk`**, the workspace's name for the SDK, resolved to its sources. A
  page outside this repository installs `@lemoncloud/chatic-apps-sdk` and imports that instead, without
  the `nxViteTsPaths` plugin.
