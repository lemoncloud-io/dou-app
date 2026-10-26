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
  Firebase Performance — cut down to exactly the traces, attributes and metrics Firebase has always
  received (`@chatic/perf`'s catalogue). The same trace also goes to the log pipeline.
- The reply does not list them (an app build from before the handlers), or there is no reply (a
  plain browser tab). Traces go to the log pipeline alone.

On the log pipeline a trace is a statistics entry (`kind: 'trace'` or `'sample'`, numbers as
structured fields), recorded through the recorder `setPerfTelemetryRecorder` hands in, which applies
the sampling policy — set by the telemetry runtime at boot, and built into the web until the server
serves one ([telemetry.md](./telemetry.md)). With statistics off for a run it records nothing; the `info`/`PERF` log lines older builds of this page wrote are gone.

Asking rather than assuming is the web-deploys-first rule: this bundle can be newer than the app
it runs in. Both messages are required, because a start with nowhere to stop leaves the native side
holding a trace until it expires.

## What the web records

| Trace             | Taken in                                                                                                                                      | Attributes                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `cloud_switch`    | `useSwitchCloudSession` (`libs/app-runtime`)                                                                                                  | `outcome`: `ok` / `error`                          |
| `site_switch`     | `switchSite` (`libs/app-runtime`), below its same-place no-op                                                                                 | `outcome`: `ok` / `error`                          |
| `web_vitals`      | `webVitalsReporter.ts`, all five as samples (value in `value_ms`, CLS ×1000); FCP and LCP also reach Firebase, INP/CLS/TTFB the pipeline only | `vital`: `fcp` / `lcp` / `inp` / `cls` / `ttfb`    |
| `chat_room_open`  | below                                                                                                                                         | `entry` · `start` · `switch` · `cache` · `outcome` |
| `chat_room_sync`  | below                                                                                                                                         | `entry` · `start` · `switch` · `cache` · `outcome` |
| `bridge_request`  | `bridgeRequestTrace.ts`, as samples — [below](#bridge_request)                                                                                | `type` · `outcome`                                 |
| `chat_send`       | `useChatMutations.sendMessage` — [below](#chat_send)                                                                                          | `thread` · `kind` (`text`) · `outcome`             |
| `chat_send_media` | `libs/app-runtime` `useSendImages`, as samples — see its image-send doc                                                                       | `kind` · `count` · `size` · `thread` · `outcome`   |
| `socket_request`  | `socketRequestTrace.ts`, as samples — [below](#socket_request)                                                                                | `type` · `kind` · `outcome` · `close_reason`       |
| `state_outbox`    | `stateOutboxTrace.ts`, as samples — [below](#state_outbox)                                                                                    | `op` · `outcome` · `kind`                          |
| `socket_verify`   | `libs/app-runtime`, as samples — see its socket doc                                                                                           | `kind` · `cause` · `outcome`                       |
| `invite_accept`   | the invite accept pipelines, per run — [below](#invite_accept)                                                                                | `lane` · `outcome` · `step` · `room`               |

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

**Firebase receives exactly these five attributes**, its cap: a switched push carries all five
(`entry`, `start`, `switch`, `cache`, `outcome`). The list is pinned in `@chatic/perf`'s catalogue.
The handle itself takes up to sixteen, so a sixth attribute added to this trace reaches the log
pipeline only — Firebase's five do not change unless someone changes that list on purpose.

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

- Unit tests: `npx jest src/app/runtime/perf src/app/features/channels/hooks/useChatMutations src/app/features/channels/hooks/useRoomOpenTrace
src/app/features/channels/hooks/useRoomSyncTrace src/app/features/channels/hooks/useForegroundChatRefresh`
  from `apps/web`;
  `npx jest src/socket/sync/roomFeed src/socket/sync/hooks/useSyncTarget src/socket/auth/socketVerifyTrace src/socket/SocketManager src/data/mediaSendTrace src/data/hooks/useSendImages`
  from `libs/app-runtime`, plus `src/data/factories/outboxFactory` there for `state_outbox`;
  `npx jest src/repositories/ChatRepository src/outbox/stateOutbox` from `libs/data`;
  `npx jest src/activeTraces src/pageHides` from `libs/perf`; and `npx jest src/app/services/perf` from
  `apps/mobile` (`first_screen`).
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
| `rtt_ms`    | dispatch → reply in wall-clock time, including the handler's own work on the app side and any time the page spent hidden before the reply came |
| `queue_ms`  | call → dispatch: time in the readiness buffer before the channel existed. Zero after boot; absent for a request called before observing began. |
| `in_flight` | other requests still unanswered when this one left — the contention the trace is looking for                                                   |
| `req_chars` | encoded request length, UTF-16 code units                                                                                                      |
| `res_chars` | raw reply length. Absent on a timeout, and absent rather than zero when the adapter reported none                                              |

`type` is the request's message type and `outcome` is `ok` or the error code it was rejected with.

Three limits keep it from distorting what it measures:

- **One run in ten.** The `isSampledRun` decision on the injected run id. Each sample is itself two
  bridge posts (the trace's start and stop), so measuring every run would add traffic to exactly the
  thing being measured.
- **Ten samples a minute.** Firebase Performance shares one rate limit across all of a device's
  traces: 300 per ten minutes in the foreground and 30 in the background (the Android SDK's defaults
  in firebase-perf 22.0.4; the iOS SDK's were not checked). Uncapped, a busy session would spend that budget on this trace and drop
  `chat_room_open`. The first ten of each minute are kept, which leans towards the start of a burst.
- **Three of a type a minute** (`BRIDGE_REQUEST_SAMPLES_PER_TYPE_PER_MINUTE`), within those ten. A
  room entry's burst repeats a few cache reads, and without it they used the whole minute; the
  console's per-`type` breakdown then had nothing for the rarer types.
- **Three before the report.** Until WebAppReady names the backend, every trace waits in one hold of
  100 entries and a sample takes two of them. A late report would otherwise let this trace push the
  boot-time `web_vitals` out of the hold.
- **Nothing while the page is hidden**, where the background budget is a tenth of the foreground one.

What it cannot see: where inside the round trip the time went. Splitting it into web → app, handler
and app → web needs the app side to stamp its own times on the reply, which ships with an app
release rather than a web deploy.

## `chat_send`

A text message's send, from the moment `sendMessage` is asked to send it to the server's answer
(`runtime.data.sendChatInCloud` settling). That covers the optimistic row, the request, the answer
and the write that replaces the row — the time the message shows as pending.

| Attribute | Values                                                                       |
| --------- | ---------------------------------------------------------------------------- |
| `thread`  | `reply` for a thread reply (the server resolves its root first), else `root` |
| `kind`    | always `text` — the same attribute `chat_send_media` carries                 |
| `outcome` | `ok`, or `error` when the send rejected — offline, refused, timed out        |

- **Text sends only.** Attachment sends go through `useSendImages` and an upload first, and are timed
  there as `chat_send_media` (see `libs/app-runtime`'s image-send doc), by `kind`.
- **A retry is a send.** `retryMessage` resends through `sendMessage`, so it is timed like one.
- **Ten a minute** (`CHAT_SEND_TRACES_PER_MINUTE`), for the same shared budget `bridge_request` is
  capped for. A burst keeps its first ten.
- **Hidden time is never in a sample.** A send from a hidden page is not timed, and one the page was
  hidden during is dropped by leaving its trace unstopped, which records nothing.

## `socket_request`

One socket request's round trip, per request type. It is the server's answer time with nothing the
screens add: `chat_room_sync`'s feed phase includes the cache write, `chat_send` the optimistic row.

- **Where it is taken.** `SocketManager` times every request made through it — the active facade's
  and every scoped client's — and hands each to the observer `main.tsx` sets
  (`observeSocketRequests`). Requests the SDK sends on its own (`device.save`, `auth.*`, a sync plan's
  catch-up) do not pass through it; `socket_verify` and `site_switch` cover the first two.
- **Attributes:** `type` (`chat.send`, `chat.feed`…), `kind` (`relay` / `cloud`), `outcome` (`ok`, or
  the leading status it was rejected with — `408`, `503` — else `error`), and on a `499` only,
  `close_reason`: what closed the socket under the request (below). Metric: `rtt_ms`.
- **Sampled like `bridge_request`, in different runs.** One run in ten, but the next tenth of the
  run-hash range (`isSocketRequestSampledRun`), so the two traces never stack their caps on one run.
- **Ten a minute, three of a type**, three while traces are held for the report. The per-type cap
  keeps a rare type such as `chat.send` visible next to `chat.feed`.
- **Hidden time is never in a sample.** `SocketManager` hands over no request the page was hidden
  during, and the web records none from a hidden page.
- **The second tenth of runs.** It hashes the run id the same way as `bridge_request` but takes the
  next bucket, so the two are never sampled in the same run.

### `close_reason`

A 499 is chatic-sockets-lib rejecting every in-flight and queued request at once as a socket closes,
so the outcome alone says only that some socket closed. `close_reason` names the close, as
`libs/app-runtime` reads it from the SDK transport (its socket doc lists the values and how each is
told apart): `pong_timeout`, `wake_recovery`, `wake_probe`, `service_restart`, `destroyed`, `server`,
`transport`, `other`.

**An attribute on the failed request, not a trace of its own.** The question is which cause makes up
the 499 share of requests, and a request is the unit of that share: a close that rejects six requests
counts six times here, as it did in the share, and a close with nothing in flight hurt nobody and
counts zero. A per-close trace would count closes instead, would need its own sampling and cap
inside the budget every trace shares, and could not be laid against the share without guessing how
many requests each close took down. This one adds no sample — only a fourth attribute of five
Firebase allows — and inherits the sampling and caps above unchanged. What it cannot say is how often
a socket closes with nothing in flight; the `[SocketManager] closed` log line is where that is.

### Reading `close_reason`

Filter `socket_request` to `outcome` = `499`, platform iOS, foreground (the trace records nothing
hidden), and break down by `close_reason`. Samples from builds before this attribute have none, so
compare from the release date on. A week of sampled runs is the first useful read.

- **`pong_timeout`** is a socket that stayed open with nothing coming back until the keep-alive gave
  up, 40–80 s later. On a resume that was the half-open zombie. With the liveness probe in place it
  should shrink: a zombie found on resume ends as `wake_probe` instead. What remains is a connection
  that died while the app was in front.
- **`wake_probe`** is the probe recycling a slot that read verified and did not answer within 3 s.
  These requests were going to fail anyway, earlier and in smaller numbers than as `pong_timeout`.
  A large `wake_probe` share with no drop in `pong_timeout` means the probe recycles healthy sockets
  and its timeout is too tight. This trace only sees a false recycle that had a request in flight; an
  idle slot recycled for nothing (a background cloud, typically) and the margin of the probes that did
  answer are in the `[recoverUnverifiedSockets] probed` log line, one per resume, with each probe's
  outcome and round trip.
- **`wake_recovery`** is the foreground kick recycling a slot that was not verified. A request should
  rarely be in flight on such a slot; a steady share means something sends before the slot verifies.
- **`service_restart`** comes from the SDK's connection rotation, roughly every 100 min on a long
  connection. Requests in flight across it fail as 499 and are its cost. In chatic-sockets-lib 0.5.7
  the rotation also left the socket closed until the next foreground kick, and every request in that
  gap failed as 503; `SocketManager` now reopens it on the next tick (`libs/app-runtime` socket doc).
  A 503 share that falls after that release, on long foreground sessions above all, is that gap
  closing.
- **`destroyed`** is the app tearing a slot down — a cloud switch, a logout. A request still in flight
  on the outgoing cloud fails this way; a large share points at a switch that does not wait for its
  requests.
- **`server`** and **`transport`** are the closes the app did not make: the server ended the
  connection, or it ended with no close frame — the network dropped or the OS killed the socket.
  `transport` is also what any 499 reads on an SDK whose transport the runtime could not observe, so a
  sudden jump to all-`transport` after an SDK upgrade is a broken hook, not a network event.

The 503 share is a different failure — a send on a socket that is not open — and has no
`close_reason`.

## `state_outbox`

How a state write reaches the server after the screen has already shown it: my read cursor, a room's
notification setting, my name for a room. These writes are local first (the state outbox in
`@chatic/data`), so the screen never waits on them, and what is left to measure is how long, and how
often, they take to land. `socket_request` cannot answer that: it times one request, and a write that
waited for a reconnect or was retried is several requests and a wait between them.

- **Where it is taken.** The outbox machine reports each key's wait to the runtime's observer
  (`libs/app-runtime` `outboxFactory.ts`), which hands it to the one `main.tsx` sets
  (`observeStateOutbox`).
- **One sample per wait, not per value.** A wait runs from the `set` that made the key wait to the
  answer that leaves nothing waiting for it. Values set meanwhile fold into it — a cursor moved three
  times while the first `chat.read` was out is one sample, timed from the first move.
- **Attributes:** `op` (`join.read`, `join.notify`, `join.nick`), `outcome` (`accepted`; `refused`, a
  4xx the server will never take; `account_changed`, another account signed in to that cloud before
  the write went out), `kind` (`relay` / `cloud`).
- **Metrics:** `delivery_ms` — the whole wait; `wait_socket_ms` — the part of it the cloud's socket
  was not verified; `attempts` — the request that ended the wait plus each that failed and was sent
  again (for `account_changed`, only the failed requests before it — 0 when nothing went out). A request answered while a newer value
  waited is not counted, so a value replaced in flight never reads as a retry.
- **Sampled in its own runs, three in ten.** Run-hash buckets 20–49 (`isStateOutboxSampledRun`), apart
  from `bridge_request` (0–9) and `socket_request` (10–19), so no run stacks two of these capped
  traces. Wider than theirs because a state write is rare: a tenth of runs gave `socket_request` about
  ten `chat.read` samples in a week, too few to compare a p90, and widening the bucket costs no run
  more of its budget, since the caps are per run.
- **Six a minute, four of an op**, three while traces are held for the report. Every run can already
  reach thirty a minute at the caps of `chat_send`, `chat_send_media` and `socket_verify`, and a run
  sampled for either request trace adds ten. This trace's runs carry neither, so their worst minute is
  thirty-six — below the forty those runs already allow, so the highest worst minute of any run does not grow. The per-op cap
  keeps a rare `join.notify` or `join.nick` from losing its minute to a burst of reads.
- **Hidden time is never in a sample.** The runtime hands over no wait that began on a hidden page or
  that the page was hidden during, and the web records none from a hidden page. A write left waiting
  in the background and sent on return is the OS's time, not a wait anyone sat through. A write still
  waiting when the app is killed is never reported either, so the far tail is under-counted.
- **Firebase only**, like `socket_request`: on an app build without the perf handlers it records
  nothing.

### Reading it

Read the metrics (`delivery_ms`, `attempts`), not the trace's duration, which is
the zero length of a sample. Break down by `op` first: a read cursor and a setting are written at very
different rates.

- **`delivery_ms` p50** is the ordinary case: a ready socket and one request, so it sits near
  `socket_request`'s round trip for the same type (`chat.read`, `join.update`). A p50 well above it
  means most writes are waiting for something, and `wait_socket_ms` says whether it is the socket.
- **`delivery_ms` p90** is the tail the outbox exists for: writes that waited for a reconnect or went
  through a retry. Before the outbox those were the writes rolled back and lost; now they land late.
  A high p90 with a low p50 is the outbox doing its job; a p90 that grows release over release is a
  socket that stays down longer.
- **`wait_socket_ms`** close to `delivery_ms` means the time went to a socket that was not verified —
  a reconnect, a cloud with no slot yet — and the request itself was quick. Near zero with a high
  `delivery_ms` means the server, or the retries, took the time.
- **`attempts > 1`** is a write that did not land on its first request: a timeout, a 5xx, or a socket
  that closed under it (499, 503), then a retry on the 2 s / 5 s / 15 s schedule or on the next
  reconnect. Its share of samples is the share of writes that, before the outbox, would have been
  rolled back. `socket_request` showed about a third of foreground requests failing 499/503 on iOS
  in the week to 2026-10-13, before the outbox; that is the number to compare against.
- **`outcome` other than `accepted`** should be rare. A steady share of `refused` is a write the
  server will never take — a room I left, a value it rejects — and worth reading in the logs.
  `account_changed` is a write overtaken by a sign-in to another account.

## `invite_accept`

The spinner after an invite's Accept: one run of either accept pipeline, from the press to the
hand-over. `cloud_switch` and `site_switch` cover two of the cloud lane's steps, but they also take
every other switch, nearly all onto a socket that is already up, so an accept's cold switch never
shows even at their p95. Nothing else times the relay lane.

- **Where it is taken.** `inviteAcceptTrace.ts`, started in `useInviteAccept.accept` (cloud) and in
  each `advance` of `useRelayInviteFlow` (relay).
- **One run is one spinner.** A run ends where the pipeline stops to ask the person for something —
  phone verification, the place-profile form — with that as its outcome, and the step that resumes it
  starts a new run. A form is paced by a person, and the native backend forgets a trace left open for
  two minutes.
- **Attributes:** `lane` (`cloud` / `relay`); `outcome` — `ok` (handed over to the room, or to home
  with no room), `pending` (relay: accepted, but the room was not found in time), `verify`, `profile`,
  `notice` (relay: the re-read found the invite expired, used, canceled or rejected, or the verified
  number is not the invited one), `error`; `step`
  on an error — for the cloud lane the pipeline step (`login-invite`, `enter-cloud`, `cache-cloud`,
  `enter-site`, `check-profile`), for the relay lane `read-invite`, `verify` or `accept`; `room` on a
  relay run that accepted — which way the room was found: `response` (the accept carried it),
  `push` (its `join.sync`), `probe` (an `invite.get` re-read), `list` (the channel-list watch), or
  `none`.
- **Marks, in ms from the press.** Cloud: `login` (the invite login answered), `cloud` (the cloud
  entered), `site` (the place entered), `profile_check` (the place profile looked up). Relay:
  `invite_read` (the re-read answered), `accepted` (`invite.accept` answered), `room` (the room
  found, or given up on). The gap between two marks is that step.
- **No cap.** A person accepts a handful of invites, ever.
- **Not recorded:** a run started on a hidden page, one the page was hidden during, and a relay run a
  newer run superseded or that was abandoned (the screen unmounted, or the reader left it). Each is
  left unstopped, which records nothing.

Reading it: break down by `lane` first. On the dev server a fresh guest's cloud run reached
`profile_check` in about 1.7 s, every step a round trip the next one needs; a relay run whose accept
did not carry the room spends most of its time between `accepted` and `room`, about a second when the
push found it. Break relay runs down by `room` to see whether production pushes the room as dev
does: a run with `list` paid at least 1.5 s for tier 2 first.
