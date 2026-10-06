# ADR-0167: Bridge requests are measured before the bridge is split

> Status: Accepted · Decided: 2026-10-06 · Implemented: `perf/bridge-request-timing`
> · Scope: libs/bridges `WebBridgeClient.setRequestObserver`, `BridgeAdapter` payload lengths ·
> libs/perf `bridge_request` · apps/web `runtime/perf/bridgeRequestTrace`
> · The module docs are [libs/bridges](../../libs/bridges/README.md) and
> [apps/web observability/performance.md](../../apps/web/docs/observability/performance.md)

## Context

Opening a room sends several requests at once — the feed, the member sync, profile lookups for
members not yet cached, the read marker — and each answer is written to the native cache over the
bridge. The room-open traces suggested those answers delay one another. The proposal on the table
was to split the bridge into priority channels and have the handler serve the urgent channel
first.

Reading the transport did not support it. In the mobile shell every message, whatever it is
labelled, takes the same path: react-native-webview has one `onMessage`, iOS delivers it on the app
main thread, Android hands it to the main thread, and `AppBridgeHost.handleMessage` runs on the
React Native JS thread. Each of those is a single queue in arrival order. The handler has no backlog
to reorder either — it starts each message the moment it arrives and awaits it, so several run at
once. And JavaScript cannot preempt: a reply being serialized holds its thread however urgent the
next message is. A second channel only overtakes anything when its handling moves into native code,
which is an app release, and older shells would keep the single channel indefinitely.

What could actually hold a message up is size: serialization and the string copy are synchronous on
the sending and receiving threads, so one large payload delays the small ones queued behind it.
Whether that happens in practice had never been measured. The one number on hand — a 1.5 MB photo
list reaching the web in 11–17 ms, against some 250 ms of native thumbnailing — pointed away from
the bridge.

## Decision

### 1. No priority channels now

The bridge stays one channel. It is revisited only if measurement shows small requests waiting
behind large ones, and then the first remedies are smaller payloads — paging, and moving binary
data off the bridge as uploads already were — before native channels.

### 2. The web times every request of a sampled run

`WebBridgeClient.setRequestObserver` reports each dispatched request as it settles: queue time,
round trip, the requests already in flight when it left, and both payload lengths. The lengths come
from the strings the adapter already built, so measuring never serializes a payload twice. With no
observer the client reads no clock.

`apps/web` records these as a `bridge_request` Firebase Performance sample. It ships with a web
deploy and needs nothing from the app.

### 3. The measurement is kept small enough not to move what it measures

- One run in ten, by the existing run sampling. Each sample is two bridge posts, so measuring every
  run would add traffic to exactly what is being measured.
- Ten samples a minute. Firebase Performance gives a device one trace budget for all traces — 300 per
  ten minutes in the foreground and 30 in the background in the Android SDK — and an uncapped trace
  would starve `chat_room_open`.
- Three samples before the WebAppReady report, because until then every trace shares a 100-entry
  hold, and none while the page is hidden.

## Consequences

- The first answer is a distribution of round trips by message type, with the in-flight count beside
  each. It cannot say where inside a round trip the time went; that needs the app to stamp its own
  times on the reply, which waits for an app release.
- In a sampled run this trace uses up to a third of the foreground trace budget, and adds two bridge
  posts per sample. Today the native perf handlers also answer those posts, which nothing reads, so a
  sample costs four main-thread hops rather than two.
- The first ten requests of each minute are kept, which leans the sample towards the start of a
  burst. That is the room-entry burst the trace exists for, but it is not an unbiased sample of every
  request.
- A later proposal to split the bridge has a number to argue with instead of an impression.
