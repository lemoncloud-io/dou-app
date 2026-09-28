# Performance traces in the web

How this app wires [`@chatic/perf`](../../../../libs/perf/README.md): where its traces go, and the
one trace it owns end to end, `chat_room_open`. The trace API, its limits and the backends are
documented in the lib.

## Where a trace goes

`main.tsx` calls `configureWebPerfTraces` (`src/app/runtime/perf/webPerfTraces.ts`) before
`initWebVitals`, so the first vitals already have somewhere to wait. The destination is decided
only when the WebAppReady reply arrives:

- The reply's `supportedWebMessages` lists both `StartPerfTrace` and `StopPerfTrace`. Every trace,
  including those held since boot, goes over the bridge, and the native shell records it with
  Firebase Performance.
- The reply does not list them, which means an app build from before the handlers. Traces go to the
  log pipeline as `info`/`PERF` entries, sampled one run in ten.
- There is no reply, which means a plain browser tab. The log backend has no injected run id, so it
  records nothing.

Asking rather than assuming is the web-deploys-first rule: this bundle can be newer than the app
it runs in. Both messages are required, because a start with nowhere to stop leaves the native side
holding a trace until it expires.

## What the web records

| Trace            | Taken in                                                                   | Attributes                                         |
| ---------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| `cloud_switch`   | `useSwitchCloudSession` (`libs/app-runtime`)                               | `outcome`: `ok` / `error`                          |
| `site_switch`    | `switchSite` (`libs/app-runtime`), below its same-place no-op              | `outcome`: `ok` / `error`                          |
| `web_vitals`     | `webVitalsReporter.ts`, FCP and LCP only, as samples (value in `value_ms`) | `vital`: `fcp` / `lcp`                             |
| `chat_room_open` | below                                                                      | `entry` · `start` · `switch` · `cache` · `outcome` |
| `chat_room_sync` | below                                                                      | `entry` · `start` · `switch` · `cache` · `outcome` |

The switch traces are taken at chokepoints rather than call sites. They sit wherever a user selection
is the only caller, and they record failures as well as successes: a switch slow enough to fail is
exactly the sample the tail is made of. INP is collected for the debug overlay but not recorded. It
keeps being revised for the life of the page, and in a WebView that lifetime is the whole session,
so there is no moment at which it is final.

## `chat_room_open`

The trace behind "the chat is slow to open". It runs from the tap that opens a room to the room's
first commit that shows messages. On the way it records which kind of wait took the time.

### Where it begins

| Entry         | Begun in                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| `list`        | the home chat list row (`ChannelList.tsx`), before the page transition, which is part of the wait          |
| `push_banner` | the in-app banner click (`useInAppPushMessage.tsx`)                                                        |
| `push_tap`    | the native notification tap. The web adopts it from `OnNavigate.perfTrace` in `useHandlePushNavigation.ts` |
| `deeplink`    | a native OS link, handed over the same way                                                                 |
| `navigate`    | an `OnNavigate` into a room from an app build that sends no trace. The web starts its own at the handler   |

An OS notification tap is started **natively** (`useDeepLinkNavigation.ts` in `apps/mobile`), at the
moment the tap reaches JS, and only when the tap leads to a room — any other navigation would never
stop it, and the SDK keeps a started trace in native memory until it is stopped. So the trace covers
what the user waited through before the web could see anything: the WebView handshake, the router
gate, a switch. It does **not** cover the launch itself. On a cold start the tap reaches JS only after
the React Native runtime and the WebView have come up, and that stretch is the `boot` trace's, in the
same run. The web adopts the trace by id, and its marks are measured from the native start.

A navigation the web receives as a path with a trailing slash (`/channels/<id>/room/`, which is what
the native URL parsing produces for a deep link) still counts as a room: the web reads the channel id
the way the router does, slash ignored and id percent-decoded.

On Android a tap on a notification the app drew itself reaches JS as a plain URL, so it arrives as
`deeplink`, not `push_tap`. Telling the two apart would need the intent to carry a marker. That is
not done yet.

Rooms opened any other way, such as search or going back through history, begin no trace and
record nothing.

### The hand-off to the room

`runtime/perf/roomOpenTrace.ts` holds the trace in a single slot, keyed by channel id, from the tap
until the room page claims it. This is the same pattern as `pushEntryRegistry`, for the same reason:
a measurement field threaded through navigation state would enter the router contract that every
screen shares.

- A trace whose room has not mounted within 60 seconds is dropped. It belongs to a navigation that
  went somewhere else. A second tap before the first room mounted also replaces the first trace.
  Neither is ever stopped, so neither is recorded.
- The room page claims the trace in `useRoomOpenTrace` (`features/channels/hooks/`).

### Phases (metrics, in ms from the trace's start)

| Metric          | Marked when                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| `handler`       | the web's `OnNavigate` handler took the navigation. For a cold tap, this is where boot and the router gate end |
| `switch_done`   | the cloud or place switch the push needed has finished (`usePushNavigate`)                                     |
| `mount`         | the room page mounted: routing and the route chunk are behind us                                               |
| `cache_emit`    | the first chat-list emission from the local cache                                                              |
| `message_count` | how many messages the room showed. A count, not a time                                                         |

The trace's own duration is the end of the wait: tap to messages on screen.

### Attributes

| Attribute | Values                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------- |
| `entry`   | `list` · `push_banner` · `push_tap` · `deeplink` · `navigate`                                      |
| `start`   | `cold` · `warm`. Only for a trace the native tap started                                           |
| `switch`  | `cloud` · `site` · `relay`. Set only when the push needed a switch                                 |
| `cache`   | `hit` if the first cache emission already had rows, `miss` if the messages still had to be fetched |
| `outcome` | see below                                                                                          |

| Outcome      | Recorded when                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `shown`      | messages are on screen. Filter on this for the clean distribution                                                         |
| `empty`      | the room loaded holding its first row (`chatNo` 1) and has nothing to show — it is proven empty                           |
| `timeout`    | nothing showed within 30s of mount. A room with no rows at all lands here, since it cannot be told from one still loading |
| `background` | the app left the foreground first. Timers stop in the background, so the duration would include the time away             |
| `left`       | the room unmounted first                                                                                                  |

`timeout`, `background` and `left` are recorded, not discarded, because a room slow enough to give up
on is the sample the investigation is for. A `left` duration runs up to one second past the moment of
leaving, because an unmounted room hands its trace back for a one-second grace window. That window
lets a remount of the same room (React's development double-mount, for one) pick it up again instead
of recording a leave that did not happen. If another room's trace began before the old room unmounted
— a banner tapped while the room was still loading — the old one is closed as `left` at once instead,
so the newer trace keeps the slot.

When the app goes to the background, a trace still waiting in the slot is dropped unrecorded (it has
not reached a room yet), and one in its grace window is closed as `left`. The native side also refuses
a stop that arrives after its two-minute window, as a backstop for the same case.

**Attributes are at Firebase's cap of five.** A switched push carries all five (`entry`, `start`,
`switch`, `cache`, `outcome`), and `outcome` is written last, so any attribute added to this trace
would silently displace it. Adding one means removing one.

### Where it ends, and why not earlier

The trace ends on the first commit where the room's skeleton gate is open (channel and chats both
loaded) **and** at least one message is present — or, for a proven-empty room, `empty`. Loading alone is not the end: on a cold cache the
first emission is empty, and the page shows an empty room while the messages are fetched. The user
is still waiting then, and `cache = miss` is what separates those opens from the rest.

The page's existing push-entry log line (`push-opened room showed its messages`) still gates on the
chat half alone. It is left as it is, because changing it would change what an existing diagnostic
measures. The trace does not depend on it.

## `chat_room_sync`

`chat_room_open` ends when the room first shows messages, and for a room with a cache those are the
cached ones — possibly stale. `chat_room_sync` runs from the same tap to the room showing its
**synced, latest** page: the socket authenticated, the latest page fetched and written, and that page
on screen. Read side by side, the two say whether "slow" means the room drew late or the room drew
fast but took long to become current.

### How it runs

It begins with `chat_room_open`, in `roomOpenTrace.begin` — or natively, for a tap, and is handed over
as `OnNavigate.perfTrace.syncId` (an app build that predates it sends none, and the web starts it at
the hand-over). It is published at once as the **active** `chat_room_sync` for the channel (see
[`@chatic/perf`](../../../../libs/perf/README.md)), because the sync that marks its phases runs in
`libs/app-runtime`, which cannot reach the web.

The room page takes it only through the slot's claim of the matching `chat_room_open`, in the same
mount (`roomOpenTrace.takeClaimedSync`). A sync trace begun for a room that was already on screen, or
for a navigation that never arrived, is never claimed, so a later, unrelated visit to that room cannot
adopt it and record a duration that started at an old tap.

The sync for a room entry is one of two fetches:

| Room | Fetch                                                                       | `cache` |
| ---- | --------------------------------------------------------------------------- | ------- |
| cold | `usePrimeChat` (`libs/app-runtime`, `useSyncTarget.ts`) — the first page    | `miss`  |
| warm | `useForegroundChatRefresh` (`features/channels/hooks/`) — the entry refresh | `hit`   |

Each marks the same phases on the active trace. The first fetch for a trace owns it: a second one —
a re-verification re-running the entry refresh, a foreground return during the same wait — leaves the
trace's `cache` and `fetched` alone, so they describe the fetch the room actually waited on. The room
page (`useRoomSyncTrace`) adds `mount` and ends it.

### Phases (metrics, in ms from the tap)

| Metric                   | Marked when                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `handler`, `switch_done` | as for `chat_room_open` — a push's handler and switch                                                                                        |
| `mount`                  | the room page mounted                                                                                                                        |
| `verified`               | the sync saw the room's socket slot verified. Usually before `mount`: the slot is already verified, and the sync hooks run first in the page |
| `feed_sent`              | the latest page was requested (`chat.feed`)                                                                                                  |
| `feed_done`              | the page came back and was written to the cache                                                                                              |
| `fetched`                | rows in that page. A count, not a time                                                                                                       |
| `latest_no`              | the newest `chatNo` in that page. What the end waits for                                                                                     |
| `message_count`          | rows in the room's window when it ended. A count                                                                                             |

The trace's own duration is the wait until the latest page is on screen: the first commit after
`feed_done` whose window holds row `latest_no`, which is the cache write re-emitting the list. The row
is checked, not just a new list, because the window can change for other reasons in between (a join
cursor arriving) and ending on that would record the room before it caught up. A page that wrote
nothing would re-emit nothing, so the sync hook ends the trace itself then.

A `verified` later than `mount` is time spent waiting on the socket; `feed_done − feed_sent` is the
server round trip plus the cache write; duration − `feed_done` is the re-emission and render.

`outcome` is `synced`, `error` (the fetch failed), `timeout` (30s from mount), `background` or `left`,
with the same meaning and the same one-second leave grace as `chat_room_open`. A room left inside that
grace is closed as `left` at once if the app goes to the background, rather than when its timer
resumes. Its attributes are at the same cap of five.

## Verifying

- Unit tests: `npx jest src/app/runtime/perf src/app/features/channels/hooks/useRoomOpenTrace
src/app/features/channels/hooks/useRoomSyncTrace src/app/features/channels/hooks/useForegroundChatRefresh`
  from `apps/web`, and `npx jest src/socket/sync/hooks/useSyncTarget` from `libs/app-runtime`.
- On a device build with Firebase debug logging on (see the lib README), open a room from the list,
  then tap a notification with the app closed. Each should log one `chat_room_open` trace, with
  `entry` `list` and `push_tap`/`deeplink` respectively. A deep link on the iOS simulator
  (`xcrun simctl openurl <udid> chatic://channels/<id>/room`) exercises the native hand-over without a
  push.
