# ADR-0200: State writes are measured per wait, in their own runs

> Status: Accepted · Decided: 2026-10-14 · Implemented: `feat/state-outbox-perf-trace`
> · Scope: libs/data `outbox/` (`OutboxObserver`) · libs/app-runtime `data/factories/outboxFactory`
> (`setStateOutboxObserver`) · libs/perf `state_outbox` · apps/web `runtime/perf/stateOutboxTrace`
> · Follows [ADR-0193](./0193-state-writes-go-local-first-and-through-an-outbox.md)
> · Amends [ADR-0181](./0181-requests-and-attachment-sends-are-measured-by-type.md)'s "lower the caps
> before adding another trace" consequence
> · The module docs are [apps/web observability/performance.md](../../apps/web/docs/observability/performance.md),
> [libs/data outbox](../../libs/data/docs/outbox/README.md) and
> [libs/app-runtime data](../../libs/app-runtime/docs/data/README.md#the-state-outbox-transport)

## Context

ADR-0193 made my read cursor, a room's notification setting and my name for a room local first: the
screen moves at the local write, and a state outbox sends the value when that cloud's socket is
verified, retrying on a schedule and on reconnects. The before was measured by `socket_request`:
`chat.read` at 132 ms p50 and 384 ms p90 on iOS, and about a third of foreground requests failing 499
or 503.

After it, nothing a person waits on is left to time, and `socket_request` no longer describes what
matters. A write that waited for a reconnect and then needed a retry is two requests and a wait
between them, and `socket_request` sees only the two requests. What there is to measure is how long
writes take to land and how often they need more than one request — the part the outbox was built for.

Two constraints held from earlier traces. Firebase allows a device about 300 traces per ten minutes in
the foreground, shared by every trace, and ADR-0181 put a run's worst minute near that average and
asked for the caps to be lowered before another trace was added. Its "about thirty" is forty at the
caps: `chat_send`, `chat_send_media` and `socket_verify` take ten a minute each in every run, and a run
sampled for `bridge_request` or `socket_request` adds ten more. This ADR takes forty, not thirty, as
the ceiling a run already reaches. And `socket_request`, at one run in
ten, collected about ten `chat.read` samples in a week — too few to compare a p90.

## Decision

1. **One sample per key's wait.** The outbox machine reports each key's wait for the server — from the
   `set` that made it wait to the answer that leaves nothing waiting — through an optional observer.
   Values set during the wait fold into it. The sample carries `op`, `outcome` (`accepted`, `refused`,
   `account_changed`) and `kind`, with `delivery_ms`, `wait_socket_ms` (the part the cloud was not
   ready) and `attempts` (the request that ended the wait plus each failed one sent again).
2. **The machine stays clock-free.** `libs/data` takes the observer, clock included, from the host, as
   it takes the transport. `libs/app-runtime` supplies it, drops a wait the page was hidden during, and
   hands samples to one observer the web sets; the web samples, caps and records them.
3. **Its own runs, three in ten.** Run-hash buckets 20–49, apart from `bridge_request` (0–9) and
   `socket_request` (10–19). Wider than theirs, because a state write is rare and the caps are per run:
   a wider bucket buys samples without spending any run's budget.
4. **Six a minute, four of an op**, three while traces are held for the WebAppReady report.

## Alternatives

- **Read it from `socket_request`'s `chat.read` and `join.update`.** No new trace, but it times
  requests, not writes: the wait for a socket and the retries — the whole point of the outbox — fall
  between samples, and its tenth of runs is too thin.
- **One sample per value, or per request.** A cursor moved three times while the first `chat.read` was
  out would be three samples, two of them never sent. Per wait is what a person would call one write.
- **Count every request in `attempts`.** Then a value replaced in flight reads as a retry, and for the
  read cursor, which moves while a request is out, `attempts > 1` would mostly mean "the user kept
  reading". Counting only failed requests keeps it meaning "did not land on the first try".
- **Time it inside `libs/data`.** It would need `@chatic/perf` and the page's visibility, both host
  concerns the lib does not otherwise have.
- **A tenth of runs, like the other request traces.** The same handful of samples a week that
  ADR-0193 started from.
- **Every run, as `socket_verify` and `chat_send` are.** It would raise every run's worst minute,
  which ADR-0181 asked not to do.
- **Lower the other caps first, as ADR-0181 asked.** Not needed: in runs 20–49, which carry neither
  request trace, six a minute takes the worst minute from thirty to thirty-six, below the forty a
  `bridge_request` or `socket_request` run already allows. Those runs' worst minute grows; the highest
  worst minute of any run does not.

## Consequences

- A write still waiting when the app is killed, or one the page was hidden during, is never reported,
  so the far tail is under-counted. A write left waiting in the background is the OS's time, not a wait
  anyone sat through; the cost is that the outbox's longest saves do not show.
- On app builds without the Firebase perf handlers it records nothing: the log fallback samples the
  first tenth of runs.
- The run-hash range has 50–99 left. A next trace that needs its own runs takes from there, and one
  that wants every run has to fit under the forty a minute the request-trace runs already reach.
- The trace exists to read the effect of ADR-0193 after it ships; if `attempts > 1` and the p90 settle
  low, the bucket can narrow back to a tenth.

## References

- [ADR-0193](./0193-state-writes-go-local-first-and-through-an-outbox.md) — the state outbox this trace
  measures
- [ADR-0181](./0181-requests-and-attachment-sends-are-measured-by-type.md) — `socket_request`, the
  per-type caps and the budget arithmetic used here
- [ADR-0167](./0167-bridge-requests-are-measured-before-the-bridge-is-split.md) — run-hash sampling for
  request traces and the WebAppReady hold
