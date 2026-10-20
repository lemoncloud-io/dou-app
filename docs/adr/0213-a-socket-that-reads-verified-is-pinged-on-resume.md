# ADR-0213: A socket that reads verified is pinged on resume

> Status: Accepted · Decided: 2026-10-19 · Implemented: `fix/socket-resume-zombie-probe`
> · Scope: `libs/app-runtime/src/socket/auth/recoverUnverifiedSockets.ts` (`recoverSocketsOnResume`) ·
> `libs/app-runtime/src/socket/SocketManager.ts` (close reasons) ·
> `apps/web/src/app/runtime/useSocketWakeRecovery.ts` · `apps/web/src/app/runtime/perf/socketRequestTrace.ts`
> · Related: [ADR-0076](./0076-app-runtime-auth-single-verdict-and-typed-session-events.md) — the
> `needsSocketKick` verdict this sits beside · [ADR-0181](./0181-requests-and-attachment-sends-are-measured-by-type.md)
> — the `socket_request` samples that measure it
> · Amends ADR-0181 decision 1 (the `socket_request` attributes gain `close_reason`)
> · The module docs are [`libs/app-runtime` socket](../../libs/app-runtime/docs/socket/README.md) and
> [auth § Waking a wedged socket](../../libs/app-runtime/docs/auth/README.md#waking-a-wedged-socket),
> and [apps/web observability/performance.md](../../apps/web/docs/observability/performance.md#close_reason)

## Context

`socket_request` showed about 31% of sampled foreground socket requests failing on iOS in the weeks
before 2026-10-14 (499 21.3%, 503 9.9%), and about 10% in the seven days after the state outbox
shipped (499 7.5%, 503 2.5%). A 499 is chatic-sockets-lib rejecting every in-flight and queued request
at once as a socket closes; nothing recorded which close it was.

One close was already understood. After the WebView is suspended, the connection can come back
half-open: the WebSocket reads open, nothing reaches the server, and nothing comes back. The slot
still holds the flags of the handshake it completed before the suspension, so it reads **verified**.
The foreground kick (`recoverUnverifiedSockets`) recycles only slots that do not read verified, by
design — recycling a healthy socket on every foreground costs a reconnect, a `device.save` and an
`auth.update`. So a zombie is left to the SDK keep-alive: a ping every 30 s with a 10 s timeout,
closing after two misses, which is 40–80 s after the resume. Every refetch the app sends on that same
foreground goes into the zombie and fails together when the keep-alive closes it.

## Decision

1. **On a foreground signal, every slot that reads verified or stale (`needsLivenessProbe`) is sent
   one `system.ping`** with a 3 s timeout (`RESUME_PROBE_TIMEOUT_MS`), in the same coalesced pass as
   the existing kick and inside the app's existing 5 s throttle. The probes go out side by side, before the first kick, so the pass is
   bounded by one timeout rather than one per slot.
2. **Only silence recycles.** A slot is recycled only when its ping timed out (408), no other frame
   arrived from it meanwhile, and the slot still holds the same client reading `connected`. A refusal
   from the server is an answer; a 499 or 503 means the socket already closed and its reconnect
   controller has it. The recycle is the kick's own — close, reconnect, marked as a `resume` for
   `socket_verify` — with close reason `wake-probe` instead of `wake-recovery`.
3. **Foreground refetches do not wait for the probe.** They go out at once. On the rare zombie, those
   requests fail when the probe recycles the slot (about 3 s in, instead of 40–80 s), and the
   re-verify edge that every screen already listens to fetches again.
4. **Opt-in per caller.** `recoverSocketsOnResume` is the probing pass; `recoverUnverifiedSockets`
   keeps its behaviour. apps/web uses the probing pass; admin-v2 and desktop-web are unchanged.

5. **A 499 says which close caused it.** `socket_request` samples with outcome `499` carry a
   `close_reason` attribute, read from the SDK transport's `close` event and named from a closed set
   (`pong_timeout`, `wake_recovery`, `wake_probe`, `service_restart`, `destroyed`, `server`,
   `transport`, `other`). Without it there is no way to tell whether this probe moved the 499 share
   or which close makes up the rest of it. The event is not on the SDK's published interface, so it
   is feature-detected; without it every 499 reads `transport`.

## Alternatives

- **Recycle every slot on foreground, verified or not.** Certain to clear a zombie, but most resumes
  find a healthy socket, and each recycle costs a reconnect and a handshake and rejects whatever was
  in flight on a socket that was working. Rejected: it trades a rare failure for a guaranteed one.
- **Shorten the keep-alive** (a shorter interval or timeout, one miss instead of two). The keep-alive's
  timers freeze with the page, so the first tick after a resume can still be up to an interval away,
  and a shorter interval pays for itself in pings on every healthy minute in the foreground.
  Rejected.
- **Make the foreground refetches wait for the probe.** That spares the zombie's refetches a failure,
  but every healthy resume — the common case — pays one round trip before anything loads, and the
  wait needs a new gate in the request path that every request crosses. On a zombie the wait would
  also have to cover the reconnect and the handshake to help at all. The re-verify edge already
  repeats the fetch, so the saving is one failed request on a rare path. Rejected.
- **A probe timeout longer than 3 s** (the keep-alive's 10 s). Fewer false recycles on a radio that is
  slow to wake, but a refetch fired on the same foreground waits that long for its failure. 3 s is
  well above a live round trip even on a waking cellular link; a false recycle shows up in the data
  as `wake_probe` 499s on requests that would have succeeded, which is what to watch.

- **Measure closes with a trace of their own** instead of an attribute on the failed request. It
  would count closes rather than failed requests, so it could not be laid against the 499 share
  without guessing how many requests each close took down, and it would need its own sampling and
  cap inside the trace budget every trace shares. The attribute adds no sample and inherits
  `socket_request`'s sampling. Rejected; the `[SocketManager] closed` log line covers closes with
  nothing in flight.

## Consequences

- A resume with a healthy socket costs one ping frame per bound slot (relay, the active cloud, up to
  five background clouds), and nothing else.
- A zombie is recycled about 3 s after the resume instead of 40–80 s. Requests already in it still
  fail, now as 499 `wake_probe`.
- **How to tell it worked.** `socket_request` 499 samples carry `close_reason`. Before this, a zombie
  ended as `pong_timeout`; after it, the same zombie ends as `wake_probe`, earlier, with fewer requests
  queued behind it. The iOS 499 share should fall, and within it `pong_timeout` should shrink while
  `wake_probe` appears. A large `wake_probe` share with no drop in `pong_timeout` means the probe
  recycles healthy sockets, and the timeout is too tight. A false recycle of an idle slot rejects no
  request and never reaches that trace, and `socket_verify` reads both recycles as `resume`, so each
  pass also logs one `[recoverUnverifiedSockets] probed` line with every probe's outcome and round
  trip: that is where the 3 s margin is judged.
- The probe leans on the SDK answering `system.ping` with a reply the keep-alive already relies on;
  no SDK change was needed.
