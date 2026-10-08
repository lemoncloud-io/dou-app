# ADR-0181: Requests and attachment sends are measured by type

> Status: Accepted · Decided: 2026-10-08 · Implemented: `feat/perf-socket-media-traces`
> · Scope: libs/app-runtime `SocketManager.setRequestObserver`, `data/mediaSendTrace` ·
> libs/perf `socket_request`, `chat_send_media` · apps/web `runtime/perf/socketRequestTrace`,
> `runtime/perf/bridgeRequestTrace`, `runtime/perf/chatSendTrace`
> · Amends [ADR-0167](./0167-bridge-requests-are-measured-before-the-bridge-is-split.md) decision 3
> (the per-minute cap) and its first-ten consequence
> · The module docs are [apps/web observability/performance.md](../../apps/web/docs/observability/performance.md),
> [libs/app-runtime socket](../../libs/app-runtime/docs/socket/README.md) and
> [image-send](../../libs/app-runtime/docs/data/image-send.md)

## Context

The traces so far measure screens: a room opening, a room syncing, a text send. They cannot say
what the server took for each kind of request, and attachment sends — images, videos, documents —
were not measured at all. The question was how each message type performs: text against a photo
against a video, a send against a receive.

Three facts shaped the answer:

- **Socket requests have one chokepoint.** Every request the app makes goes through
  `SocketManager.request` or a scoped client's `request`, which already report failures.
- **An attachment send outlives a trace.** The native Firebase backend forgets a trace open for two
  minutes, and a large video's conversion and upload can take longer.
- **The trace budget is shared.** Firebase allows a device about 300 traces per ten minutes in the
  foreground, across every trace. `bridge_request` already takes up to ten a minute in its runs.

## Decision

1. **`socket_request`: every app-originated socket request, by type.** `SocketManager.setRequestObserver`
   hands each settled request — its `type`, the slot's `kind`, its `outcome` (`ok` or the rejection's
   leading status) and its round trip — to an observer the web sets. With no observer nothing reads a
   clock; an observer that throws is logged and never changes the request's result; a request the
   page was hidden during is not handed over.
2. **Sampled in a different tenth of runs from `bridge_request`.** Both traces sample one run in ten,
   but on disjoint ranges of the run hash, so one run never carries both caps.
3. **Caps are per type as well as in total.** Ten a minute in total, three of one type, for both
   `socket_request` and `bridge_request`. A total alone was spent on the most frequent types, and the
   rarer ones — `chat.send` beside `chat.feed` — never reached the per-type breakdown this is for.
4. **`chat_send_media`: attachment sends, timed in the runtime as a sample.** From the send to its end,
   with each phase as a metric (row written, conversion, socket ready, prepared, upload started, bytes
   settled, upload completed, sent), by `kind`, `count` and `size` buckets, `thread` and `outcome`. A
   sample rather than a start and a stop, so a send longer than two minutes is still recorded.
5. **`chat_send` carries `kind: 'text'`**, so the two send traces read side by side.

## Alternatives

- **Per-message-type receive timing (`chat_receive`).** Built and dropped before merge. A received
  message is a server push, not a request, so `socket_request` cannot see it, and the server-to-device
  delivery time cannot be measured: the device and server clocks disagree. What remains measurable is
  the time from arrival to the row on screen — usually 50–150ms of cache write and render — and it
  was not worth its share of the trace budget.
- **Drop `chat_send`, since `socket_request` times `chat.send`.** Kept: `socket_request` samples one run
  in ten and three `chat.send` a minute, so it collects few sends; `chat_send` records in every run.
- **Push timing.** Server send time to device receipt has no common clock (iOS gives no server time),
  and the iOS notification extension cannot record Firebase traces. A push tap to the room is already
  `chat_room_open` with `entry: push_tap`.
- **A start-and-stop trace for attachment sends.** Lost exactly the slowest sends to the two-minute
  native expiry.
- **One total cap across every trace.** Fairer to the budget, but it couples every trace module to one
  counter, and a busy trace would silently starve the others in ways the console cannot show.

## Consequences

- In a run sampled for socket requests, the worst case is about thirty traces a minute across
  `socket_request`, `chat_send`, `chat_send_media` and `socket_verify` before the screen traces — the
  budget's average. Ordinary use stays well under it, but a heavy minute can push the budget, and
  Firebase then drops traces without saying which. Lower the caps before adding another trace.
- `bridge_request` no longer keeps simply the first ten requests of a minute: it keeps the first three
  of each type up to ten. ADR-0167's "leans towards the start of a burst" now holds per type.
- `socket_request` records nothing on app builds without the Firebase perf handlers: the log fallback
  samples a different tenth of runs.
- `chat.sync` frames' attachment kinds are not measured, so a receive-side regression by message type
  stays invisible.

## References

- [ADR-0167](./0167-bridge-requests-are-measured-before-the-bridge-is-split.md) — the bridge trace and
  its budget, amended here
- [ADR-0120](./0120-performance-traces-move-to-firebase-performance.md) — Firebase Performance as the
  trace backend
