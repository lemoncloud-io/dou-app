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
| `bridge_request` | `bridgeRequestTrace.ts`, as samples — [below](#bridge_request)             | `type` · `outcome`                                 |

The switch traces are taken at chokepoints rather than call sites. They sit wherever a user selection
is the only caller, and they record failures as well as successes: a switch slow enough to fail is
exactly the sample the tail is made of.

`site_switch` also carries one metric, `verified`: when the socket it switches on was verified. That
splits the switch into the wait for the socket and the `auth.switch` round trip. A wait that timed
out leaves it unset.

INP is collected for the debug overlay but not recorded. It keeps being revised for the life of the
page, and in a WebView that lifetime is the whole session, so there is no moment at which it is
final.

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

| Metric           | Marked when                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `handler`        | the web's `OnNavigate` handler took the navigation. For a cold tap, this is where boot and the router gate end    |
| `handshake_done` | a push that needed a switch saw the current socket verified (`usePushNavigate`)                                   |
| `recover_done`   | the check that re-caches a lost invited cloud finished — a no-op when the cloud was still cached. Native app only |
| `cloud_done`     | the cloud switch, or the return to relay, has finished                                                            |
| `switch_done`    | the cloud or place switch the push needed has finished (`usePushNavigate`)                                        |
| `mount`          | the room page mounted: routing and the route chunk are behind us                                                  |
| `cache_emit`     | the first chat-list emission from the local cache                                                                 |
| `message_count`  | how many messages the room showed. A count, not a time                                                            |

The trace's own duration is the end of the wait: tap to messages on screen.

The four switch marks split a switched push's wait into its steps, which run one after another:
the wait for the current socket, the invited-cloud recovery, the cloud switch, and the place switch,
which ends at `switch_done`. `switch_done` alone could not say which of them held a slow switch. A
step the push did not need leaves no mark, so the place switch is `switch_done` minus the latest
mark before it.

Two cases leave a `switch` attribute naming a switch that did not complete, because the attribute is
set before the first wait:

- **The handshake timed out.** None of the four is marked. The push lands without switching, and
  the room ends the trace as usual. Filter on `handshake_done` to keep only the switches that ran.
- **A step threw.** That step and every later one are unmarked, and the push still lands. The last
  mark present is where the switch failed.

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

Both go through `fetchRoomFeed` (`libs/app-runtime`), which marks the phases on the active trace. On
a list entry the fetch usually starts earlier still, at the tap (`prefetchRoomFeed`, called by
`ChannelList.tsx`), and the hook that applies joins it. That fetch is the one that takes the trace, so
on those entries `feed_sent` lands just after the tap, ahead of `mount`. It is how the room's wait
overlaps the page transition, and it is the change to compare against: before it, `feed_sent` came
after `mount`.

Compare on `entry` `list` only. A push or a deep link starts no fetch at the tap, and neither does a
tap while the socket is not yet verified, so on those `feed_sent` still comes after `mount`. A
prefetched trace can also lack `cache`: the cold-or-warm read runs beside the request, and a read
that failed records nothing.

The first fetch for a trace owns it, and callers that join it mark nothing. A second fetch is one sent
after the two-second reuse — a later re-verification — or one that asked to be fresh, such as a
foreground return. It leaves the trace's `cache` and `fetched` alone, so they describe the fetch the
room actually waited on. A second tap on the same room while its first fetch is out begins a new
trace, and that trace takes the fetch it waits on. Only the owning fetch may end the trace as `error`:
a fetch that fails without owning it, or a failure before any fetch took it (the warm refresh's cache
read, say), leaves the trace to end the way it otherwise would. The room page (`useRoomSyncTrace`)
adds `mount` and ends it.

### Phases (metrics, in ms from the tap)

| Metric                                                                   | Marked when                                                                                                                                  |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `handler`, `handshake_done`, `recover_done`, `cloud_done`, `switch_done` | as for `chat_room_open` — a push's handler and the steps of its switch                                                                       |
| `mount`                                                                  | the room page mounted                                                                                                                        |
| `verified`                                                               | the sync saw the room's socket slot verified. Usually before `mount`: the slot is already verified, and the sync hooks run first in the page |
| `feed_sent`                                                              | the latest page was requested (`chat.feed`)                                                                                                  |
| `feed_received`                                                          | the page came back from the server, before it was written to the cache                                                                       |
| `feed_done`                                                              | the page came back and was written to the cache                                                                                              |
| `fetched`                                                                | rows in that page. A count, not a time                                                                                                       |
| `latest_no`                                                              | the newest `chatNo` in that page. What the end waits for                                                                                     |
| `message_count`                                                          | rows in the room's window when it ended. A count                                                                                             |

The trace's own duration is the wait until the latest page is on screen: the first commit after
`feed_done` whose window holds row `latest_no`, which is the cache write re-emitting the list. The row
is checked, not just a new list, because the window can change for other reasons in between (a join
cursor arriving) and ending on that would record the room before it caught up. A page that wrote
nothing would re-emit nothing, so `fetchRoomFeed` ends the trace itself then.

A `verified` later than `mount` is time spent waiting on the socket; `feed_received − feed_sent` is
the server round trip; `feed_done − feed_received` is the cache write, which crosses the native bridge
twice; duration − `feed_done` is the re-emission and render.

`outcome` is `synced`, `error` (the fetch that owned the trace failed), `timeout` (30s from mount),
`background` or `left`, with the same meaning and the same one-second leave grace as
`chat_room_open`. A room left inside that grace is closed as `left` at once if the app goes to the
background, rather than when its timer resumes. Its attributes are at the same cap of five.

## Verifying

- Unit tests: `npx jest src/app/runtime/perf src/app/features/channels/hooks/useRoomOpenTrace
src/app/features/channels/hooks/useRoomSyncTrace src/app/features/channels/hooks/useForegroundChatRefresh`
  from `apps/web`, `npx jest src/socket/sync/roomFeed src/socket/sync/hooks/useSyncTarget` from
  `libs/app-runtime`,
  `npx jest src/repositories/ChatRepository` from `libs/data` and `npx jest src/activeTraces` from
  `libs/perf`.
- On a device build with Firebase debug logging on (see the lib README), open a room from the list,
  then tap a notification with the app closed. Each should log one `chat_room_open` trace, with
  `entry` `list` and `push_tap`/`deeplink` respectively. A deep link on the iOS simulator
  (`xcrun simctl openurl <udid> chatic://channels/<id>/room`) exercises the native hand-over without a
  push.
- On the same build, open a room that has a cache and one that does not. Each should log one
  `chat_room_sync` trace, with `cache` `hit` and `miss` respectively, and
  `feed_sent ≤ feed_received ≤ feed_done`.

## `bridge_request`

One bridge request, timed from the web side. It exists to answer whether bridge messages hold each
other up — whether a large reply makes the small requests behind it wait — before anything is built
to prevent that. Splitting the bridge into priority channels was considered and rejected on what the
code shows: every message, whichever "channel" it is sent on, crosses the same app main thread and
the same React Native JS thread in order, so a second channel only reorders anything once its
handling moves into native code. These samples are what would justify that, or justify shrinking
the payloads instead.

`main.tsx` calls `observeBridgeRequests` right after `configureWebPerfTraces`, so the boot burst —
the WebAppReady handshake included — is measured, and its samples wait with the other traces for
the report.

| Metric      | Meaning                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `rtt_ms`    | dispatch → reply, including the handler's own work on the app side                                                                             |
| `queue_ms`  | call → dispatch: time in the readiness buffer before the channel existed. Zero after boot; absent for a request called before observing began. |
| `in_flight` | other requests still unanswered when this one left — the contention the trace is looking for                                                   |
| `req_chars` | encoded request length, UTF-16 code units                                                                                                      |
| `res_chars` | raw reply length. Absent on a timeout, and absent rather than zero when the adapter reported none                                              |

`type` is the request's message type and `outcome` is `ok` or the error code it was rejected with.

Three limits keep it from distorting what it measures:

- **One run in ten.** The same `isSampledRun` decision as the log fallback. Each sample is itself two
  bridge posts (the trace's start and stop), so measuring every run would add traffic to exactly the
  thing being measured.
- **Ten samples a minute.** Firebase Performance shares one rate limit across all of a device's
  traces: 300 per ten minutes in the foreground and 30 in the background (the Android SDK's defaults
  in firebase-perf 22.0.4; the iOS SDK's were not checked). Uncapped, a busy session would spend that budget on this trace and drop
  `chat_room_open`. The first ten of each minute are kept, which leans towards the start of a burst.
- **Three before the report.** Until WebAppReady names the backend, every trace waits in one hold of
  100 entries and a sample takes two of them. A late report would otherwise let this trace push the
  boot-time `web_vitals` out of the hold.
- **Nothing while the page is hidden**, where the background budget is a tenth of the foreground one.

What it cannot see: where inside the round trip the time went. Splitting it into web → app, handler
and app → web needs the app side to stamp its own times on the reply, which ships with an app
release rather than a web deploy.
