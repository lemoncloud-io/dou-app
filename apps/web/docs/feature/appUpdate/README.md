# appUpdate — a newer build, and the oldest one the web still runs in

`apps/web/src/app/features/appUpdate` owns two things. The first is one dialog and the status behind
it: is there a newer store build, and has this person already been told about that exact version.
That prompt is **optional** and blocks nothing. The second is the **floor**: the oldest phone app the
web still runs in, below which the update screen is all there is (§ The floor).

The check itself is not the web's. The shell asks the store and answers over the bridge; this
feature decides whether to interrupt someone with the answer, and remembers that it did.

## Responsibilities

This feature decides **when to ask** and **when to stop asking**. It decides nothing about what
counts as an update — that is the shell's `VersionService`, and the rules it follows (only a live
store version counts, Android has no live-version source) are documented in
[`apps/mobile`](../../../../mobile/docs/release/app-update.md).

The split is worth stating once, because both halves have a "version check" in them:

| Question                                                | Answered by                                               |
| ------------------------------------------------------- | --------------------------------------------------------- |
| Is there a newer build, and where is its store page?    | the shell — an iTunes lookup for iOS, nothing for Android |
| Should this person see a dialog right now?              | here                                                      |
| Should the my-page version row read as up to date?      | here, through the same shared status                      |
| Is there an alert at launch, before the WebView exists? | the shell, separately — see the doc above                 |

So a user can meet two prompts about one update: the shell's boot alert and this dialog. They are
independent by design, and neither suppresses the other.

## The shared contract

### The bridge round trip is the only source

There is a boot-time injection, `CHATIC_APP_SHOULD_UPDATE`, and this feature deliberately ignores
it. On a cold start the store lookup resolves _after_ the WebView is created, so the injected value
is always `false`; the follow-up `OnUpdateDeviceInfo` push that would correct it is dropped whenever
it lands before a `useDeviceInfo()` consumer has populated the device-info store. Only
`appBridge.checkAppUpdate()` is correct at the moment it is asked.

`useAppUpdateStatus` runs that call on mount and on every foreground return, and publishes the
result into a module-level zustand store. Sharing the store is what keeps the dialog and the my-page
row from disagreeing: a consumer mounted later reads the answer already found rather than asking
again, and the native side caches a successful lookup, so mounting the hook from several places is
cheap.

**A failed check keeps the previous status.** The bridge rejects in a browser and on an older shell,
and treating that as "no update" would be a guess in the wrong direction.

**Non-native never asks.** `isNative()` false means no call and the "no update" default — a browser
has no store build to compare against.

### The dialog opens on a derivation, not on an event

`open` is `updateAvailable && latestVersion !== dismissedUpdateVersion`. Nothing holds a "have we
shown this yet" flag: dismissing writes the version, which closes the dialog on the next render and
keeps it closed for every later check of the same version. A separate bookkeeping flag is what would
drift from the persisted dismissal.

**Every way out counts as a dismissal.** Later, ESC and an outside click all route through one
`onOpenChange`, and so does pressing Update — going to the store is not a reason to ask again on the
next foreground return. Re-nagging every time the app resumes is worse than under-nagging.

The consequence to keep in mind: a person who taps Update and then does not update is not asked
again **until the store serves a version newer than the one they dismissed**. That is the intended
trade, not an oversight.

### The dismissal is a local-lane config row

`ui.dismissedUpdateVersion` is a registry key in [`@chatic/config`](../../../../../libs/config/README.md)
— `writableBy: ['local']`, `persist: 'local'`, default `''`. It is per device, which is right: being
told about an update on a phone says nothing about a tablet.

Writes pass `{ lane: 'local' }` explicitly. A dismissal stored under the pre-registry
`chatic-dismissed-update-version` key is not carried over — such an install is simply asked again.

### The my-page version row reads the same status

`SettingsPage` shows the up-to-date / update-available label **on iOS only**, because Android has no
live-version source and a label there would be a guess. It reads `updateAvailable` from this
feature's hook rather than `versionInfo.shouldUpdate` — the latter is the boot-time injection, which
is the value that is always `false` on a cold start.

The row opens the store only when an update is actually pending; otherwise it is inert. That rule,
and why the row carries no hidden gesture any more, belongs to [mypage](../mypage/README.md).

## The floor

[`lib/appVersionFloor.ts`](../../../src/app/features/appUpdate/lib/appVersionFloor.ts) holds
`APP_VERSION_FLOOR`, the oldest phone app version the web runs in. `AppVersionFloorGate` wraps
everything under the app root except the debug overlay: for an iOS or Android shell whose injected
`CHATIC_APP_CURRENT_VERSION` is below the floor it renders `RequiredUpdateScreen` instead — the reason,
and an Update button that sends `OpenStore` — and nothing else mounts, no runtime, no socket.

**Why a floor exists.** The web is deployed on its own schedule, and every installed app keeps
loading the newest web. Without a floor the web had to carry a fallback for every shell ever shipped —
a probe for a handler, a latch for an old reply, a second path for a missing capability — with no
moment at which any of them could be known dead. The floor is that moment. **Raising it is what lets
the fallbacks for the shells below it be deleted**, and nothing else does.

**How it decides.**

- Only `ios` and `android` are held to it. The desktop shell updates itself and loads its own web
  build; a browser has no app.
- It compares the app's marketing version, not the bridge version — that is what the stores sell, what
  a person can see in their store page, and what the shell injects.
- A shell that injects no version, or one that does not read as `major.minor.patch`, is let through.
  Every shipped shell injects one, so an unreadable value is a defect, and locking every user out on a
  defect is the wrong way to find it.
- It is read once, on the first render. The installed version cannot change while the page lives.
- The debug overlay is inside the gate too: its screens assume a shell at the floor.
- `main.tsx` still runs before the gate, so the parts of it that talk to the shell ask the floor
  themselves: statistics are collected only from apps at or above it (`runtime/telemetry/policy.ts`),
  traces go to the shell's Firebase only from them (`runtime/perf/webPerfTraces.ts`), and the log
  uploader keeps a below-floor app's logs in the page's own queue (`runtime/logging/logUploader.ts`).
  The gate logs once when it turns an app away (`VERSION`) — nothing else of the app runs to say so.
- `apps/web-e2e/src/specs/app-version-floor.spec.ts` runs the fake shell at a version below the floor.

**The floor is 0.30.0** (bridge 2.9.0): the handshake that lists the shell's handlers, the photo
library with videos and paging, the attachment picker, haptics, saving and sharing files, and the
share intake are there in every app the web runs in. Fallbacks for capabilities newer than that —
the sub WebView (bridge 2.10.0 on), the voice recorder (2.13.0) — stay until the floor passes them.

**Raising it.** Pick a version the stores have served long enough that nobody is stuck on an older
one (the installed-version spread is in admin-v2), change `APP_VERSION_FLOOR`, then delete the
fallbacks it makes dead in the same change — `libs/bridges/src/version.ts` says which bridge version
brought each capability. The fake shell reports a current version (`FAKE_SHELL_APP_VERSION`), so the
web-e2e scenarios run above the floor; keep it at or above it.

## What not to do

- **Do not read `CHATIC_APP_SHOULD_UPDATE` or `versionInfo.shouldUpdate` to decide anything.** Both
  are the boot injection. Ask the shared status.
- **Do not add an "already shown" flag.** The dismissed version is the whole of the state.
- **Do not treat a rejected check as "no update".** Keep the last status.
- **Do not make this dialog blocking.** Blocking is the floor's job, and the floor is a version, not
  a store answer: the dialog's status is missing on Android and lags on iOS.
- **Do not add a fallback for a shell below the floor.** Raise nothing silently either: a floor change
  and the deletions it allows go together.
- **Do not write the dismissal on any lane but `local`.** A shell-lane write would outrank the
  device's own record on the next boot.

## Notes for implementers and tests

Both hooks have a spec, and they cover the two halves separately — the status hook's sharing,
foreground re-check and failure behaviour, and the prompt hook's open/dismiss derivation, including
that a dismissal does not re-trigger a bridge round trip and that a **newer** version re-opens the
dialog. `UpdatePromptDialog.test.tsx` covers the dialog itself.

```bash
npx jest --config apps/web/jest.config.js features/appUpdate
```

- **A partial `@chatic/bridges` logger mock breaks these suites.** The status hook logs, and a mock
  missing a level turns a new log line into a `TypeError` inside the effect. Mock all four.
- **Transitions are logged, standing state is not.** `logger.info('VERSION', …)` fires only when
  `updateAvailable` flips, because the hook runs on every mount and every foreground return; a
  failed check is `logger.warn`. Both edges exist to answer the two shapes of report this feature
  attracts — "the prompt never appeared" and "it keeps appearing after I updated" (ADR-0075).
- **`AppUpdatePromptHost` is mounted at the app root, not on a route.** An update prompt is not a
  screen's concern, and mounting it under the router would tie it to whatever is rendered.

## Further reading

- [`apps/mobile`](../../../../mobile/docs/release/app-update.md) — the shell half: the live-version
  lookup, the boot alert, and why Android never reports an update.
- [bridge/](../../bridge/README.md) — the seam `checkAppUpdate` and `openStore` cross.
- [mypage](../mypage/README.md) — the settings version row.
- [`@chatic/config`](../../../../../libs/config/README.md) — the registry, the lanes, and what
  `persist: 'local'` means.
