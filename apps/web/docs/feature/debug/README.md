# debug — the developer overlay and the gate in front of it

`apps/web/src/app/features/debug` is the app's only developer surface: a floating panel of **26
screens** that inspect runtime state, drive native bridge commands and read cached rows directly,
plus the hidden gate that decides whether that panel exists at all. There is no `/debug` route —
the panel is an overlay mounted beside the router, and the only way in is the gate.

This document covers what the feature owns and the rules that break things when ignored. How the
panel itself is put together, and why the app's own debug UI was folded into it, is
[observability/debug-panel.md](../../observability/debug-panel.md)'s subject.

## Layout

Things that sound like they are here and are not:

- **`webVitalsStore`** lives in `app/utils/`, not `metrics/`. The Boot and Perf screens read it;
  the reporter that feeds it (`app/utils/webVitalsReporter.ts`) is app-level because the server
  upload is not a debug feature.
- **There is no `tabs/` directory.** The tab strip is a projection of the same manifest the home
  menu uses (`DEBUG_TABS` vs `DEBUG_MENU_SECTIONS`), not a separate set of components.
- **There is no `debugMenu.ts`** and no `MiniPanel`/`ExpandedSheet`. One panel, one catalog.

## Responsibilities

**In** — the unlock gate and its dialog; the panel's navigation, sizing and chrome; the 26 screens
and their copy; the runtime metric collectors.

**Out** —

- **Where the unlock is triggered.** The tap target is on the Lab page, owned by
  [mypage](../mypage/README.md). This feature exports `useDebugUnlock` and the dialog; it does not
  own the screen they are mounted on.
- **The entry code and the stage policy.** Both are registry keys in
  [`@chatic/config`](../../../../../libs/config/README.md) (`debug.entryCode`,
  `debug.overlayEnabled`).
- **The log buffer itself.** The Log Buffer screen is a viewer;
  [`@chatic/logger`](../../../../../libs/logger/README.md) owns the queue, the listeners and the
  upload.
- **Push tap routing.** `app/bridge/navigation/` resolves an `OnNavigate` into a route — see
  [bridge/push-navigation.md](../../bridge/push-navigation.md). The Push screen only observes.

## The shared contract

### Three things can turn the panel on, and only one of them is a person

`useDebugMode()` reads one boolean, and it is an OR of three sources
([useDebugMode.ts](../../../src/app/features/debug/hooks/useDebugMode.ts)):

| Source                                | Set by                                            | Lives for                          |
| ------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| `sessionStorage['chatic-debug-mode']` | the 10-tap + entry-code unlock                    | the tab                            |
| `window.CHATIC_APP_DEBUG_MODE`        | the native shell, injected at WebView boot        | the installed app's persisted flag |
| config row `debug.overlayEnabled`     | its own `byStage` rule (`LOCAL: true, DEV: true`) | the session                        |

The stage row is why a local dev never taps anything, and the reason it is a registry rule rather
than an `import.meta.env` check is that a repackaged shell cannot claim to be DEV: the row resolves
through `env.buildStage`. **On PROD all three are false until someone passes the gate**, and the
sessionStorage record is the only one that can become true there.

Disabling has to clear more than the record. `setDebugModeEnabled(false)` writes
`debug.overlayEnabled = false` on the local lane as well, because on LOCAL/DEV the stage rule is
what opened the panel and clearing only sessionStorage would leave it open. It also clears the
config unlock key, without which every `surface: 'dev'` control inside the panel renders disabled on
exactly the build where it is needed.

### The gate is a gesture and a code, and it fails closed

Ten taps within three seconds (the counter resets after three) raise the challenge dialog — but only
when an entry code is configured; without one the taps do nothing at all, silently. Three wrong codes
put the counter back to zero, and cancelling does the same. An unlock lives in `sessionStorage`, so
it ends with the tab, and the panel's own home can disable it.

The two halves do different jobs and neither replaces the other: **the gesture hides that a door
exists, the code asks whether you are allowed through it.** A person who hits ten taps by accident
meets a dialog they cannot pass, and three wrong answers put them back at zero taps.

`verifyDebugCode(input, expected)` is `!!expected && input === expected`, and the first clause is
the whole point — without it a build with no code configured would let `'' === ''` through. It is
not a timing-safe comparison, deliberately: the threat is an accidental arrival, and the code is
inlined in the bundle anyway.

The dialog is a plain text field submitted by the confirm button or Enter, not a fixed-length digit
pad: a pad that submits when its length fills ties the dialog to a code of exactly that length. The
input is trimmed on submit, because a soft keyboard can append a trailing space that would fail the
exact match, and is never otherwise transformed. It is emptied on every close and after a wrong
attempt, so the next try is a fresh code rather than an edit of the rejected one.

### The entry code comes from the build and from nowhere else

`debug.entryCode` declares `envDefaultKey: 'VITE_DEBUG_CODE'` and `writableBy: []`. No lane can
supply it — not the shell, not local storage, not the panel's own settings screen. An unset secret
leaves it at `''`, which is the fail-closed above.

CI injects it into `.env` in four blocks (`deploy-dev.yml` ×1, `deploy-prod.yml` ×1,
`force-deploy.yml` ×2) from a secret named `<PREFIX>_DEV_DEBUG_CODE` / `<PREFIX>_PROD_DEBUG_CODE`.
The workflows strip empty assignments afterwards, so **whether the secret exists is the per-environment
on/off switch** — the wiring is already there, and an environment that should not have the panel
simply has no secret. The value is masked in Actions logs and plainly readable in the shipped
bundle; that is consistent with the threat model, not an oversight.

```bash
grep -rn "VITE_DEBUG_CODE" .github/workflows apps/web/.env.example
```

### One catalog, three sizes, three sections

[`screenManifest.ts`](../../../src/app/features/debug/overlay/screenManifest.ts) is the only place a
screen is declared. Everything else is derived from it: the home menu (`DEBUG_MENU_SECTIONS`,
grouped `info` → `tools` → `data`), the tab strip (`DEBUG_TABS`, every screen in menu order), the
lazy components (`screenRegistry.tsx`), the icons (`screenIcons.tsx`) and the forced sizes
(`DEBUG_SCREEN_SIZES`).

**Size is not navigation.** `mini`, `dock` and `full` change how much room the panel takes, never
which screens exist. `mini` and `dock` float and capture pointer events only inside themselves, so
the app underneath stays drivable while a screen watches it; `full` covers the viewport for content
the dock is too narrow for (`CacheTest` and `UploadTest` force it). Switching screens keeps the
current size unless the manifest demands otherwise, so the panel never resizes under the reader.

### Ten screens need the native shell

`requiresShell: true` marks a screen whose entire purpose is a bridge command — in a browser it
could only render buttons that fail. The panel checks once and shows a notice instead of the
screen, which replaces the per-screen `isNative()` checks that not every screen had.

```bash
grep -c "requiresShell: true" apps/web/src/app/features/debug/overlay/screenManifest.ts
```

The flag is **not** for a screen that merely has a native-only corner. Log Buffer, Cache Metrics and
the Bridge screen stay usable in a browser — the Bridge screen exists precisely to report that no
shell is attached. Shell presence is polled once a second while the panel is open
(`useShellPresence`), because the injected globals can appear after the web mounts.

### The overlay lives outside the router, and that costs it the contexts

`DebugOverlayHost` is mounted in `app.tsx`, outside both the `Router` and `AppRuntime`. That is what
keeps it reachable during a boot hang, when the router renders null and the panel is most useful.
The price is that it sits outside `ActiveCloudDataProvider` and `OtherCloudUnreadProvider`, so a
screen calling `useActiveCloudData()` throws "provider is missing".

`DebugObservationReporter` solves that by mirroring, not by re-observing: mounted inside the
providers in `AppRuntime`, gated on debug mode, it publishes the same objects into
`sharedObservationStore` for the panel to read. A second, independent observation would hide the
exact bug the inspector exists to find. With debug mode locked the reporter renders null and adds no
consumer at all.

The reporter takes only its own two slots down when it unmounts. The room slot below belongs to the
page that publishes it, and a reporter remount must not blank an inspector pointed at a room that is
still open.

The host also wraps the panel in its own `ErrorBoundary`. A crashing screen used to reach the
app-wide boundary and replace the entire UI — a read-only inspector taking the app down with it.

### The Room screen shows what the open room holds, not a second read of it

Chasing a wrong bubble means telling three copies of one record apart: what the screen holds, what
the cache holds, and what the server says. The DB screen reaches only the second, and starts from a
domain rather than from a room. The Room screen starts from the room that is open.

- **The pages publish themselves.** `ChannelRoomPage` and `ThreadPage` call `useDebugRoomMirror`,
  which writes the channel and both message lists into the `room` slot of `sharedObservationStore`,
  tagged with which of the two it is. No reporter in `AppRuntime` can do this, because the lists exist
  only inside the page. With debug mode locked every effect in the hook returns early, so the cost is
  reading the debug-mode flag on each render.
- **One slot, because the routes are exclusive.** The room and its thread never render together, so
  there is one open surface at a time. A page clears the slot on unmount only while the slot is still
  its own, so a cleanup that lands after the next page published cannot blank it.
- **Two lists, because the room filters.** `rendered` is what the bubbles are drawn from (`messages`
  in the room; the root and its replies in a thread). `rows` is `useChats`' `rawChats`, the feed window
  before that filter: event rows (reactions, revision notices), replies and hidden rows are there and nowhere on screen. A
  message that never shows up is usually the one being chased, so the list can browse either.
- **A long-press points the screen at a message.** Whatever opens the action sheet on a message (a
  long-press, or a reaction chip's add button) publishes `roomFocus`,
  and the screen opens that message at the top, from either list. The focus outlives the sheet, so
  the panel can be opened afterwards. It names the surface and channel it came from and is ignored
  anywhere else, so moving to another room does not carry it along.
- **Cache and server copies are fetched on request, per record.** The cache read is a one-shot
  `cacheRead`. The server read goes through the repository (`chat.getChat`, `channel.refreshOneInCloud`),
  which writes what comes back into the cache like every other read in the app; the screen says so
  under the result. Both go to the record's own cloud (`getCloudRepositories(cid)`), not the selected
  one. A row with no chat number has not reached the server, so it gets no server button.

### The Storage and DB screens show the stores this run uses, not every store there is

Both screens answer "where does this run keep it, and what is in there", so both start from what the
run actually chose rather than from what the environment could hold. Nothing else keeps those
choices — `startRuntime` only logs them under `app.runtime_port` — so
[`app/runtime/activeStorage.ts`](../../../src/app/runtime/activeStorage.ts) records them as they are
made:

| Recorded                                | By                                             | When                         |
| --------------------------------------- | ---------------------------------------------- | ---------------------------- |
| the store set (`resolveStorageStores`)  | `main.tsx`                                     | before the runtime starts    |
| the adapter id per port, and the engine | `main.tsx`, from `startRuntime`'s answer       | once the runtime has started |
| each cache domain's route               | `cache.web-local` (`config/adapters/cache.ts`) | when the data assembly runs  |

The routes are the ones the assembly reported through `routed`, not a fresh `route()` call: the
assembly asks once per domain and keeps the answer for the session, and inside the phone app the
shell's capability report can land after it — asking again could name a store the rows are not in.
On a launch the app's own runtime owns (`engine.mirror`), the page builds no cache and no route is
recorded; the DB screen says the repositories answer from the app's runtime instead.

**The Storage screen** lists the roles of the store set — session secrets, session state, app state,
tab state — and the medium each lands in this run (device vault, `localStorage`, `sessionStorage`),
then every key of every medium in use with search, a field filter, a sort, edit, delete and add.
Writes go through the store objects the set built, never through `window.localStorage` or a fresh
vault channel: the vault is a memory copy the app reads synchronously, and only its own `set`
updates that copy and sends the write to the shell; where site data is blocked the web stores are
page memory, and a second object would not be the one the app reads. JSON values are shown indented
and stored back compact. A value the app already read into memory (a zustand store, the session's
token) takes effect at the next load, which is why the screen has a reload button. The vault's keys
are not readable when the app holds the session (the page never opens the vault on such a launch) or
when the shell could not read it this run; the screen says which, instead of showing an empty list.

**The DB screen** lists, per cache domain, the store it is routed to, then the rows of one domain in
one scope — the selected cloud, or another cloud the cache knows — with the same search, field filter
and sort, and edit, delete, add and clear. Every read and write goes through the repositories, the
path the app takes, so the screens observing a row redraw when it changes (checked: an edit and a
delete on a message showed in the open room at once) and it works whichever store holds the domain.
Two consequences follow from that path, and a few notes on how the screen is built:

- `chat` and `join` list one channel per call, so the screen walks the cached channels — `chat` capped
  at a number of newest rows per channel the screen lets you set. A channel whose read fails is
  named; the others still list.
- A write is merged into the cached row: a field deleted in the editor keeps its old value, and
  `null` is how to clear one. A new message newer than the room's covered feed range lands in the
  cache but appears in an open room only after the next read covers it (a reload, a sync).

- The per-channel reads run **one channel at a time**: on the phone each read is a bridge round trip,
  and a burst of them would queue behind the app's own reads. `user` lists every cached user with no
  channel and filters by membership when one is picked.
- Rows are tagged with the domain and cloud they were read for. Picking another domain or cloud must
  not leave the previous rows on screen, because their buttons already act on the new pick; an
  editor or an armed button meant for the old pick is dropped too. The search applies on blur or
  Enter, since every keystroke would otherwise re-read every channel, and only the first 300 rows are
  drawn (the Storage key list has the same cap) because rendering thousands makes the panel crawl:
  the search finds the rest.
- A new row's template carries only an id and the fields it needs to be visible; the repository
  stamps `cid` and `uid` from the scope it is bound to. A row id must be a non-empty string, since
  every repository keys its rows by it.

`meta` (the sync cursors) has no repository on the page and is not listed.

### The Storage screen's clear section empties both stores because the device keeps two

Inside the app, what survives a restart is split. The WebView's own storage holds the session —
sign-in, the per-cloud token cache, the selected cloud and place — plus `@chatic/config` and UI
state. The chat cache and the invited-cloud list are not there: `libs/db` routes them to the shell's
SQLite (`FetchNativeStorageSummary` / `ClearNativeCache`). Settings' "clear cache" empties only the
chat cache, and resetting the WebView leaves the SQLite half, so a stale entry on one side survived
whichever clear was used — a cached cloud token kept an account in the wrong session even though
its places and channels had been cleared. The screen lists both halves with sizes
([`lib/webStorage.ts`](../../../src/app/features/debug/lib/webStorage.ts) groups the web keys) and
clears either or both.

What each clear does, and why it stops where it does:

| Clear | Removes                                                                           | Keeps                                                                   |
| ----- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| App   | Every SQLite cache table                                                          | `invites` always; `invite_clouds` unless its box is ticked; all of MMKV |
| Web   | localStorage, sessionStorage, every IndexedDB database, every Cache Storage entry | the unsent logs (`@chatic/web.log.*`)                                   |
| Both  | App first, then web; a failed app half stops before the web half signs anyone out | as above                                                                |

- **Invited clouds are opt-in** because the server has no list of them. A cleared row comes back
  only when a push names that cloud, and until then the device cannot enter it. The checkbox says so,
  and changing it disarms a clear already tapped once.
- **Invite dismissals are never cleared** natively. `invites` carries `dismissedAt`, which only this
  device writes; Settings' clear keeps it for the same reason. In a browser the same rows live in
  IndexedDB and go with the web clear — the warning says so.
- **Logs are never cleared**, on either side. MMKV holds the shell's settings and its unsent log and
  report queues, and the web keeps its unsent log batches: no copy of server data, so wiping them
  fixes no stale-cache bug and destroys the evidence for the one being chased.
- **The web clear takes the sign-in with it** on purpose. A sign-in that survived would carry the
  cached cloud tokens that are one of the things being cleared. The databases are deleted first;
  the two storages are emptied last, synchronously, and the page leaves in the same task, so a token
  refresh still running cannot write the session back in between.
- Every clear takes two taps, and every successful one reloads (`/` after a web clear, the same URL
  after an app clear), because screens and react-query still hold what they read. A failed or partial
  clear does not reload, so the failure stays on screen. A successful one also asks the next boot to
  retire every sync cursor saved before it (`runtime.data.requestSyncCursorReset`, the same hand-off
  Settings' clear uses): a sync in flight during the clear can land afterwards and claim "synced up to
  now" over an emptied store.

The screen is not `requiresShell`: in a browser the web half is all there is, and still worth
reading. A failed summary request shows its error in the native half, and its clear stays off.

## How the screens behave

The panel is opened when something looks wrong, so its screens are written not to make it look
better than it is. Rules every screen follows:

- **A control claims only what it learned.** `useDebugOperation` has two entry points. `run` is for
  commands the app answers: the line under the buttons shows the response (cut at 400 characters) or
  the failure message. `fire` is for fire-and-forget posts (`openURL`, `setBadgeCount`,
  `openSettings`, `openShareSheet`): nothing comes back, so the line says "sent (no confirmation)"
  instead of implying the app acted. An older app build that rejects an unknown command shows as a
  failure, not smoothed into success.
- **"Copied" is earned.** `copyTextWithResult` resolves with what the host's copy actually did (the
  bridge reply or the Clipboard API); an absent `navigator.clipboard` (a non-secure context, an old
  WebView) is a failure, not a silent no-op. `CopyButton` takes a getter rather than a string because
  screens poll, so the copied snapshot is the one on screen at the click. A copy button inside a
  clickable row does not toggle the row, and a row with nothing to copy shows no icon and ignores
  taps, rather than reporting an error nobody can act on.
- **Explanations work without hover.** `HintRow` shows the value's meaning in the native `title`
  tooltip on desktop, and its label is also a button that reveals the same text inline. On a device
  there is no hover, and a Radix tooltip would not help, because it closes on `pointerdown`.
- **Live readings are polled, not subscribed.** Route, Boot, Perf, Cache Metrics, the shell-presence
  check and the socket-slot list read module state or a telemetry snapshot that has no listener, so
  they re-read once a second while the screen is open. An answer that lands after a newer read began,
  or after unmount, is dropped, and a failed read keeps the last list.
- **Nothing published says so.** The Unread screen shows a "not published" notice, not zeros, when
  the runtime has not committed its providers yet (a boot hang, a gated session).

What the individual screens do:

- **Config** lists every setting the device is running with: title, current value, default, which
  row won (`origin`) and whether this device may write it. Overridden keys come first, because "why
  does this device behave differently" is what brings people here. Editing writes the `local` lane
  only, and a refused write says why. `meta` keys and `debug.entryCode` are left out: the lock
  switch does not belong inside the screen the lock guards, and the entry code is a credential on
  a screen whose list is copyable. The list is re-read on demand (refresh, or after a write) so it
  never reorders under the reader; the dotted key stays searchable and in the JSON copy.
- **Log Buffer** is a viewer over the log upload queue. On the phone it reads the queue through the
  bridge without consuming it; in a browser it reads the running uploader's queue directly. Entries
  show newest first, and the search box takes plain words (all must match), `-word` to exclude,
  `tag:NET` to restrict to a tag and `"quoted phrase"`; anything that does not parse is plain text. The
  search reaches the entry's `data` and `error`, since the message is usually the generic half and
  the id or status code is in the payload. Tag chips list only the tags present in the buffer.
  **Hold server send** pauses sending so the queue can be read; it is a debugging lever, not an
  opt-out, and the screen says so. **Discard** throws away what was waiting to be sent for good,
  and **Send now** reports that the attempt finished, not that the server accepted the batch. An empty
  list is expected while sending is on, since the uploader drains what it ships.
- **Route** shows the history stack and the visited trail side by side, because they disagree by
  design (`/a → /b → back → /c` leaves a trail of `a, b, c` and a stack of `a, c`). A misbehaving
  back button is a stack question; "how did the user get here" is a trail question. The "can go
  back" row asks the same function the back button asks, not the snapshot, because a `pushState`
  that bypassed the router kills the live index while the tracker still shows its last one.
- **Unread** shows the aggregates the home surface and the app badge use, plus the other clouds'
  cached counts. It lists the numbers each channel's count is derived from (head and read
  position) for channels that carry a badge or whose read position has no `metaNo` snapshot, the
  one case whose count runs low until the room is read again.
- **State** lists every socket slot, not only the active one, because a background cloud holds its
  own connection and a reconnect storm there never reaches the active socket's state. Its copy is JSON
  built at click time, since the shape matters more than the layout when it is pasted into an issue.
- **Bridge** answers the question the other native screens cannot: which injection channels exist
  (`RN WebView`, `Chatic handler`, `webkit handler`) and which protocol version this web speaks,
  then sends any command by hand as a request or a post. Ping is the round-trip check. The failure
  code and message are shown as they came, which is what tells an old app build from a missing
  channel.
- **Deeplink** hands the app a deeplink through `openURL`, so the OS resolves the scheme back to the
  app and the same routing runs as for a real invite link or push tap. `buildAppDeeplink` prefixes a
  relative input with `net.deeplink.scheme` (`chatic` on PROD, `chatic-dev` on DEV) and leaves an
  absolute `scheme://` input unchanged, so the cross-check presets can prove that the other channel's
  scheme does not capture this build. The log records what was sent; whether the app routed it is
  visible in the app.
- **Invite link conversion** turns a share link into the redirect URL the web reads, through the same
  `buildInviteEntryParams` the `/s` route uses, so the tool cannot drift from the app. Only the
  absolute base is added, and it is editable to retarget any environment.
- **Custom Zip** points the app's WebView at a custom web build. The app, not this screen, refuses it
  on a PROD build (the guard is native, on the baked build stage, so a compromised web bundle cannot
  unlock it); the screen disables Apply when the app reports it is not allowed. Turning it off is
  never refused.
- **Session Owner** switches who holds the session on the phone, the page or the app's own runtime.
  The app decides whether it is offered: a production build answers only while its debug mode is on.
  A change is recorded by the app and applied by restarting its JS, which reloads this page, so a
  successful switch is the last thing the screen shows. If nothing reloads within five seconds the
  screen reads the owners again rather than stay stuck.
- **IAP** shows the store's answer verbatim, so a mismatch between what Apple or Google returns and
  what the plan catalog expects is visible. Buying is a post: the result arrives later as
  `OnPurchaseSuccess` or `OnPurchaseError`, which the screen subscribes to, and it never says
  "purchased" from the call alone.
- **OAuth** exercises the native sign-in sheet, a different path from the web's own relay hand-off.
  Apple sign-in is iOS-only, so a failure on Android is the expected answer, and the screen prints
  what came back, including a relay code in the virtual shell.
- **Upload Test** drives the native file transfer against the local S3 stand-in
  (`node scripts/upload-test-server.js`). The scenario is part of the URL, so each run only changes
  where the transfer points. The test server is reached at the host the page was loaded from (the
  device's LAN address on a real phone), and random ids use `getRandomValues`, because
  `crypto.randomUUID` needs a secure context and a device loads the dev server over plain http.
- **Boot** measures the current web session live (navigation timing, milestones, paint vitals,
  and whether the core `/assets/` bundles came from cache: a transfer size of zero with a decoded
  body, or zero with a duration under 30 ms, since some WebViews zero the size for cross-origin
  entries). **Boot Records** is different: the native side's persisted history, one merged record per
  boot, which exists only after a boot finished. The web snapshot is sent to the shell once per page
  load, about three seconds after the router unblocks, so late chunk and font entries are in it.
- **Perf** shows what `MetricsCollector` aggregates web-side. Throughput and latency count live chat
  deltas only: the first list seen for a channel seeds a baseline and is treated as history. Long
  tasks come from the Long Tasks API, started at boot so early jank is captured, and the screen
  reports it as unsupported where the engine lacks it (WKWebView has no `longtask` entry type). The
  heap reading exists only on Chrome-family WebViews.
- **Cache Metrics** sorts by cumulative time (count × average), not by average: a call that is slow
  once and one that is fast but called constantly need different fixes, and only the cumulative view
  shows which is eating the time.
- **Email Login** signs in without navigating, so the overlay stays open and the metrics collected
  so far survive; the sign-up and password-reset links do leave the page.
- **Sub WebView** opens a sub web view by hand and shows the whole round trip, including the
  `OnSubWebViewClosed` event with its reason and `result`, which the Bridge screen would not show.
  Every close is logged, not only the views this screen opened.

## Usage

The panel opens itself. The calls from outside this feature are:

- the Lab page's `useDebugUnlock`, handed the `debug.entryCode` row, and
  `debugOverlayActions.open(size)` to jump straight to a size once unlocked;
- `AppRuntime` mounting `DebugObservationReporter` inside its providers;
- the room and thread pages calling `useDebugRoomMirror`
  ([§ The Room screen](#the-room-screen-shows-what-the-open-room-holds-not-a-second-read-of-it)).

### How to add a screen

1. Write the component under `overlay/screens/`, exported by name.
2. Add an entry to `DEBUG_SCREENS` in `screenManifest.ts`: `key`, `icon` (a lucide name),
   `section`, a `load` that imports the component, plus `size` or `requiresShell` if it needs them.
3. Add the icon to `DEBUG_SCREEN_ICONS` in `screenIcons.tsx` — the map is typed against the
   manifest, so a missing one fails to compile.
4. Add `title` and `short` for the screen in **both** language tables in `i18n/index.ts`. The tables
   are `Record<DebugScreenKey, …>`, so the compiler asks for both.
5. Put every word the screen itself shows in `i18n/screens/<Screen>.ts`: an `en` table, a `ko` table
   typed `typeof en`, and `export const use<Screen>Strings = defineDebugStrings({ ko, en })`. Text
   with a number or a name in it is a function (`(count: number) => string`), because word order
   and plurals differ. Logs and thrown errors stay inline English — they are for whoever reads the
   console, not for the panel. Words several screens share (copy buttons, operation results) are
   in `i18n/screens/shared.ts`.
6. In the screen's test, pin the language with `setDebugLanguageForTests('en')` in `beforeEach`
   (and call the undo it returns in `afterEach`). i18next is not initialised under jest, so an
   unpinned test renders the Korean fallback.

Nothing else. The registry, the menu, the tab strip and the size rules all derive from step 2.

### What not to do

- **Do not write a label next to the screen that uses it.** Every word the panel shows — chrome,
  menu, screen names and screen bodies — goes in a table under `i18n/`, in both languages. A label
  written wherever it happens to be used is how one panel ends up half English and half Korean.
  Korean is the fallback language: the QA docs the panel is used against are Korean.
- **Do not fetch the panel's copy from `/locales/`.** The panel is what you open when boot is
  broken, and translations behind a network request come up as raw keys in exactly that case.
- **Read env through the config registry, not `import.meta`, in a screen.** Under Jest `import.meta.env`
  is a fixed production build (ADR-0371), so a screen that reads it cannot be tested as a development
  build without a mock. Keep verdict logic in pure functions.
- **Do not add a second catalog for "screens worth a tab".** The strip carries all of them in menu
  order. A hand-picked subset means a second rule about which screens deserve a chip, and the menu
  is one tap away regardless.
- **Do not wrap a scrolling screen in a flex child without `min-h-0 flex-1`.** The panel body
  (`overlay/DebugPanel.tsx`) is `min-h-0 flex-1 overflow-y-auto`. A flex child defaults to
  `min-height: auto` and refuses to shrink below its content, so without it `overflow-y-auto` never
  activates, the child outgrows the panel and the rest is clipped: content that cannot be reached.
- **Do not let a screen consume a React context from the app tree.** Mirror it through
  `sharedObservationStore` instead; the host is out of tree on purpose.

## Notes for implementers and tests

- **`runtime.settings.get('debug.entryCode')` answers `undefined` before the entry point wires the
  settings.** That reads as "no code configured", which is the fail-closed path — correct, but it
  means an unlock attempt during a very early boot silently does nothing.
- **Unlock state is a module-level signal; tap state is component-local.** Every mounted
  `useDebugMode()` must see the same enabled flag the moment the Lab page unlocks, which is why it
  is a `useSyncExternalStore` signal that also subscribes to the config row. The tap counter and the
  challenge live in `useRef`/`useState` because only the screen attempting the unlock should know
  about them.
- **`main.tsx` sends `appBridge.setDebugMode(false)` on every boot.** It clears a persisted flag
  that older installed app builds still read; the native debug UI it used to gate no longer exists.
  Unlocking afterwards propagates through `runtime.diagnostics.debugMode` (`setDebugMode(true)`
  underneath; `null`, so nothing to tell, in a browser).
- **`screenManifest.test.ts` is the catalog's guard** — unique keys, menu and registry in step, the
  tab strip in menu order, every icon resolvable, every screen named in both languages. A new screen
  that skips a step above fails there rather than at runtime.

    ```bash
    npx jest --config apps/web/jest.config.js features/debug
    ```

- **The panel needs an unlocked session to appear in a browser preview.** On a LOCAL build the stage
  rule opens it for you; otherwise set `VITE_DEBUG_CODE` in `apps/web/.env`, tap the Lab card's icon
  ten times within three seconds, and enter it.

## Further reading

- [observability/debug-panel.md](../../observability/debug-panel.md) — how the panel is assembled
  and what moved into it from the native shell.
- [push-verification.md](./push-verification.md) — the on-device runbook for the Push and Device
  Info screens.
- [mypage](../mypage/README.md) — the Lab page that hosts the tap target.
- [bridge/push-navigation.md](../../bridge/push-navigation.md) — what happens after a push is tapped.
- [`@chatic/config`](../../../../../libs/config/README.md) · [`@chatic/logger`](../../../../../libs/logger/README.md)
