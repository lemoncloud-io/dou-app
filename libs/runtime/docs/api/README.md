# The app API

**What an app calls.** `src/api/` is the part of `@chatic/runtime` the call part of an app reaches,
through `runtime`: the engine an app's entry point hands over, the host ports it publishes, the commands
and reads that go through that engine, the settings' reads and writes, the plain functions
`@chatic/runtime-react`'s hooks wrap, and the facade groups `runtime` is assembled from. No `react`,
`react-dom`, `@tanstack/*` or `zustand` — the root lint's `layer:runtime` constraint refuses them.

It sits above the engine and the remote connection and below the declaration
([layers](../layers/README.md#inside-chaticruntime)). Everything but the facade groups was the package
`@chatic/runtime-client`, which now re-exports this folder's barrel and `src/declare/` under its old name.

**Apps never import it.** They reach every name here through `runtime` from `@chatic/runtime-react`,
which re-exports what its groups sell; the rest is the runtime's own wiring. The one exception is the
runtime declaration ([docs/declare](../declare/README.md)), which an app's entry takes from
`@chatic/runtime-web` or `@chatic/runtime-mobile`: each hands it on beside its own adapters.

```text
libs/runtime/src/api/
├── index.ts               the folder's barrel — what @chatic/runtime-client re-exports, with declare/'s
├── facade.ts              the groups `runtime` holds, and the host's seven ports
├── domain.ts              the domain's names, flat beside `runtime`
├── boot.ts                the `boot` group: initAppRuntime, isNativeApp, the secret-storage boot step
├── platform.ts            what the platform adapter hands in (`providePlatform`)
├── init.ts                the engine holder: initAppRuntime · runtimeEngine · resetRuntimeEngine (tests)
├── host/                  the host ports: the one holder (host), its live bindings, HOST_PORT_NAMES and
│                          re-exports of the contracts from @chatic/ports
├── settings/              the config facade's reads and writes (settings.ts), and the `settings` group
├── connection/            the sockets through the engine; the connectivity verdict (deriveConnectivity);
│                          the `connection` group
├── data/                  repositories, the cache and its writes through the engine; withCloudHold;
│                          the once-per-cloud name syncs; the `data` group
├── session/               reads, commands, account lookups, the sign-out callbacks, the page's own
│                          device id, the paired-cloud check and the pairing request flow; this
│                          device's pairing name (pageDevice.ts); the `session` group
├── sync/                  the sync engine as the app drives it; primeChatRoom, syncTargetKey; the `sync` group
├── push/                  the `push` group
├── report/                reportIssue over the handed-in origin, and the `report` group
├── diagnostics/           the user's issue report (submitIssueReport) and the log-batch upload
└── utils/                 1 file — isNativeApp
```

A group barrel (`<group>/index.ts`, `settings/index.ts`, `facade.ts`, `domain.ts`, `boot.ts`) holds
`export … from` statements and nothing else — [`facade.test.ts`](../../src/api/facade.test.ts) reads the
source to keep it so — and `@chatic/runtime-react` re-exports each through the subpath of its folder
(`@chatic/runtime/api/session`, `/api/connection`, `/api/data`, `/api/sync`, `/api/push`,
`/api/settings`, `/api/facade`) and adds its hooks beside them.

What only a page can answer — its host profile, its address, its user agent, the shell's injected
device ids — is handed in by the platform adapter (`platform.ts`) or by the caller (`submitIssueReport`
takes an `IssueReportOrigin`, `createPairingRequestFlow` takes the page's request). The folder compiles
without the DOM's types in `tsconfig.neutral.json`, all but the page-facing `facade.ts`, `boot.ts` and
`utils/isNativeApp.ts`, and its tests run in Node, so nothing here can assume a page.

The barrel also hands on, unchanged, the core's types and constants the hooks use (`RELAY_SLOT`,
`slotKeyOf`, `RELAY_CLOUD_ID`, the image-send helpers of `@chatic/data`, the policy and controller
types of the engine), so a hook takes the core through `@chatic/runtime-client` alone.

Tests that need an engine hand one over first — `initAppRuntime({ ...coreEngine, session })` with
`coreEngine` from `src/engine/engine.ts` and the fakes under `src/engine/testing/` — and a test that
mocks one of these modules names its file, so the mock replaces it for every importer. Inside the package
that is a relative path; `@chatic/runtime-react`'s tests still name it by the old package
(`@chatic/runtime-client/data/dataCommands`, `@chatic/runtime-core/engine`), which `tsconfig.base.json`
and their jest config map to `src/api/` and `src/engine/`.

## The host ports

What the host does for a feature — sell, pick media, move files, take links out, run the frame around
the page, sign in, carry diagnostics, receive push — is one **port** each, chosen once by the app's
entry point from what the shell declared before the page ran. The reasons are ADR-0324's; in short, a
feature never asks which host it is in, only what the port says, so a host that cannot do something
is an implementation that says so rather than a check scattered across screens.

The two halves that are not a page's:

- **The contracts** live in [`@chatic/ports`](../../../contracts/ports/README.md) (`src/host/`, a file for
  each port). `host/ports.ts` and the per-port files here (`host/checkout.ts`, `host/media.ts`,
  `host/files.ts`, `host/links.ts`, `host/appShell.ts`, `host/signIn.ts`, `host/diagnostics.ts`,
  `host/push.ts`) re-export them under the names they always had, so no caller changed; `host/ports.ts`
  also keeps `HOST_PORT_NAMES`, the one value, because `@chatic/ports` holds types only.
  `host/contractShapes.spec.ts` checks at typecheck that each domain type the contracts use is exactly the same
  shape as the bridge payload an adapter hands through. `HostPorts` has one field per port, and each
  port has its type.
  `checkout` is a union — `store` (an app store, with `products()`, `purchase()`, `finish()`,
  `currentPurchases()`, `openManagement()`), `web` (`open(url)`, the website sells) or `none`. Every
  other port keeps its choice, `kind: 'shell' | 'browser'` (`ShellOrBrowser`, with `os` on `appShell`
  and `signIn`, the phone platform behind a `'shell'` answer), and carries the work as members:
  `MediaPort` (the app's picker, photo library, video conversion and camera permission), `FilesPort`
  (`put`, and the app's transfer module: a kept file's put, the upload catch-up, opening and saving a
  downloaded file, reading a video's frame), `LinksPort` (`openUrl`, `copyText`, and the share sheet,
  share intake, contacts, SMS, link preview and sub web view), `AppShellPort` (`ownsWindow`,
  `reportsKeyboardHeight`, and haptics, the frame's preference store, the back gesture, the icon and
  dock badges, alternate icons, the store update, the app's own updater and its page in the OS
  settings), `SignInPort` (`sessionScope`, `approvesPairing`, `requestsPairing`, and the app's own
  provider sign-in and a sign-in through the OAuth relay), `DiagnosticsPort` (`entry`, and the app's
  debug switch, boot metrics sink and pending-report queue) and `PushPort` (the app's notification
  feed, device token, token renewal and local banner). A member every host does is a method or a field;
  a capability only some hosts have is a member that is `null` where the host lacks it, so a feature
  asks for the member, never for `kind` — `@nx/workspace-host-port-kind`
  ([`tools/eslint-rules/host-port-kind.js`](../../../../tools/eslint-rules/host-port-kind.js)) reports a read
  of `kind` (and of `os`) off any of these ports outside an app's `src/config/` and tests.
- **The holder** (`host/hostPorts.ts`): `host`, published once by the entry point
  (`host.publish(ports)`) and refused a second time, since a replacement would leave every caller that
  already read a port holding the old one. `host.ports` throws before the publish, naming the missed
  step; `host.isPublished` is for a caller that can do without, such as a crash screen;
  `host.resetForTests()` is for tests.

Beside the holder sit the bindings `facade.ts` sells as `runtime.<port>`: `checkoutPort`,
`mediaPort`, `filesPort`, `linksPort`, `appShellPort`, `signInPort`, `diagnosticsPort`, and push's
fields one by one — `pushKind`, `pushNotifications`, `pushDeviceToken`, `pushTokenRenewal` and
`pushLocalBanner`.
They are module-level `let`s the process's `host` reassigns on every publish and reset, and a
re-export of a `let` is live — so `runtime.checkout` _is_ `host.ports.checkout`, with no getter of the
facade's own. Before the publish each port binding is a stand-in whose every property read throws the
same error `host.ports` does (`then`, `toJSON` and the probes a test runner makes answer `undefined`,
so printing one does not throw over the failure being printed). Push's fields join the push hooks
as `runtime.push.kind`, `runtime.push.notifications`, … because `runtime.push` was already their group.
`pushKind` is a string and cannot throw, so it is `undefined` until the publish; each push member is a
stand-in that throws on use until then, rather than reading as `null` — the browser's answer — off a
port that was never chosen. A `HostFacade` a test makes for itself binds nothing.

The rules the ports keep:

- **Every port field is required.** A host that cannot do something gets an implementation that says so
  (`checkout.kind === 'none'`, a `null` member such as `links.contacts` or `media.picker`), never a
  missing field a feature then fills with a browser's answer.
- **Published once, read at the point of use.** A module that read a port at module scope would throw
  before the publish, or keep what it read first after it.
- **Product rules stay out.** What a membership allows, which tier sits next to which, who bills a
  membership — those stay in the feature, and take a port's facts as input.
- **Libraries do not read the ports.** `@chatic/runtime` and `@chatic/theme` are also rendered by apps
  that declare no host ports (`apps/admin`, `apps/landing`), where a read would throw. They read
  `@chatic/bridges`' host profile instead.

Asking the host what it is — `isNative()`, `isNativeApp()`, a `CHATIC_APP_*` global off `window` — is
reported outside an allow-list by `@nx/workspace-host-facts`
([`tools/eslint-rules/host-facts.js`](../../../../tools/eslint-rules/host-facts.js)); a feature reads the
port instead.

Reading the shell's declaration into these ports is a page's job and lives in
[`@chatic/runtime-hybrid-web`](../../../runtime-hybrid-web/README.md#the-host-ports-a-page-publishes). An app names the
adapters that do it in its runtime declaration ([docs/declare](../declare/README.md)), and `startRuntime` publishes their values into
`host`, once, before the engine boots.

## Settings

`settings/settings.ts` is the config facade as the call part of an app reads and writes it:
`getSetting`, `settingSnapshot`, `settingSnapshots`, `overriddenSettingSnapshots`, `setSetting`,
`clearSetting`, `subscribeSettings` and `isSettingsInitialized`. `settings/index.ts` sells them as
`runtime.settings` under the facade's own method names (`get`, `snapshot`, `snapshotAll`, …). Each
forwards to the process's one `config` when it is called — not bound at import — so a test that
mocks or spies on `@chatic/config` still reaches them. Wiring the config (`init`, the remote lane) is
the entry point's and is not here.

## Why it works this way

- **Connectivity.** `deriveConnectivity` treats `navigator.onLine` asymmetrically. `false` outranks the
  active socket's transport state (a dropped link can sit in `connected` until the next frame fails), but
  a verified socket on any slot overrules it, because Chromium can latch `false` while requests succeed.
  `true` only proves an interface is up, so it never reports `online` by itself; only a socket that is
  connected and verified does. With the browser online, a `closed` socket therefore reads as reconnecting,
  not offline: the fault is ours or the server's, and telling the user to check their wifi would be wrong.
- **Cloud hold.** `withCloudHold` works against the room's own cloud's repository, never the current
  selection's. An upload takes seconds, and a cloud switch in that time would otherwise put the finished
  message on the next cloud's socket.
- **Page device id.** It is read and made on the first call only. A page that was given the shell's id
  never touches the session's store, which matters when the session runs in the app's process and the page
  has no store of its own to read.
- **Log upload.** The upload request must not be logged and the uploader never calls `logger` (failures go
  to `console`): an upload failure that became a log entry would join the queue being drained and make the
  next flush fail the same way. The opt-out is the report gateway's network-log bypass; the runtime must
  not build a request of its own.
- **Log upload outcomes.** A 4xx discards the batch (it will never be accepted as is); 5xx, offline and
  timeout retry. 401 and 403 are the exception and are retried: signing out and in as someone else is
  ordinary, and the queue deliberately survives logout, so discarding on "not signed in right now" would
  lose the entries a session problem leaves behind.
- **Issue reports and Slack.** The report payload rides as a JSON string in `message`, which is also the
  Slack message text. One base64 screenshot exceeds Slack's ~40k-character limit, and the backend stores
  only `message` (a separate `meta` field is dropped), so a report with images is sent `silent`: stored,
  not announced. Reports without images keep their Slack ping.
- **Issue report fields.** The environment is sent lower-cased (`local`, `dev`, `prod`) so the outgoing
  value stays byte-identical to what the admin console may already filter on. The app name is `mobile` for
  any page with a shell bridge at boot, desktop shell included; otherwise `admin` when the project name
  contains `admin`, and `web` for everything else.
- **Report URLs.** `reportUrl` masks every query value wholesale and drops the fragment. The report is
  stored and may be relayed to a shared channel, and this app keeps secrets in queries (OAuth callbacks,
  verify and reset links) and fragments. Masking by key name would be a guess, since which parameter holds
  the secret depends on the link; the set of parameter names that were present is the diagnostic value and
  survives. `code` is deliberately kept: an invite failure cannot be traced without knowing which invite,
  and the report is internal. Logs get a similar policy from `@chatic/logger` but never keep `code`
  (uploaded logs are read more widely), so a change to query masking should be weighed for both. The URL
  is cut as a string rather than parsed with `URL`, so relative hrefs and schemes without an origin take
  the same path.
- **Host ports: links.** `openUrl` hands a URL to the OS browser in the phone app, because loading an
  arbitrary site in its WebView would strand the person on a page with no way back and the session's
  cookies attached. A link's preview is app-only because the page cannot read another origin's HTML.
- **Host ports: sign-in.** The provider sign-in has no timeout on `start`: the provider's screens belong to
  the person for as long as they need, and a credential arriving after a deadline would be dropped while
  they were already signed in there.
- **Host ports: app shell.** `ownsWindow` is true only where the app opened the window for this page alone,
  so the page may force-close a dead socket or reload itself; in a browser tab a reload or dropped socket
  the person did not ask for would lose their work. A badge read is `null` when unknown, never 0, since 0 is
  a real badge. WebKit has no `navigator.vibrate`, so haptics need the frame.
- **Host ports: store checkout.** On Android a tier change must carry the base plan being replaced
  (`oldPlanId`), because the replacement mode is derived from old versus new plan rank; without it the
  change is booked as a brand-new subscription.
- **Host holder.** It is a module holder, not a React context, because logging, the boot sequence and other
  plain modules read ports too. An unpublished port answers `then`, `toJSON` and similar probes with
  `undefined` so a failed assertion or a logger printing it does not throw a second error.
