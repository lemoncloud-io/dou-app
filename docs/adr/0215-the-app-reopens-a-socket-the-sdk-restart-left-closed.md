# ADR-0215: The app reopens a socket the SDK restart left closed

> Status: Accepted · Decided: 2026-10-20 · Implemented: `fix/socket-rotation-reconnect`
> · Scope: `libs/app-runtime/src/socket/SocketManager.ts` (`reopenAfterRestart`) ·
> `libs/app-runtime/src/socket/auth/socketVerifyTrace.ts` (`hasResumeKick`)
> · Related: [ADR-0194](./0194-the-app-recovers-a-socket-refusals-error-code.md) — the same
> stance: the app works around an SDK gap and pins the SDK behaviour in a test ·
> [ADR-0213](./0213-a-socket-that-reads-verified-is-pinged-on-resume.md) — the close reasons this
> reads and the wake recovery it yields to
> · The module doc is [libs/app-runtime socket](../../libs/app-runtime/docs/socket/README.md#why-a-socket-closed-closereason)

## Context

chatic-sockets-lib rotates each connection before the server's own lifetime limit: about every 100
minutes (110 minus 10, ±10%) its `ConnectionRotationController` calls the reconnect controller's
`restart()`. In 0.5.7 that restart closes the socket with `client.disconnect(1012, 'service-restart')`.
With a reconnect controller attached, `client.disconnect` routes into that controller's `stop()`, which
marks it stopped (`active = false`, `manualStop = true`). The `tryConnect()` that `restart()` calls next
returns at once, and nothing else reconnects a manually stopped controller. Driving the real client
over a fake socket confirms it: after `restart()` the state stays `closed` and no new socket is opened.

The app passes no `reconnectOptions`, so the sync runtime's rotation uses the client's own controller —
the configuration with the defect. In this app, `connect()` is called only by the slot bootstrap and the
foreground wake recovery. So a connection that lives past its rotation — a long foreground session, a
background cloud slot — closes and stays closed until the next foreground or a rebind, and every
request in that gap fails as 503 `SOCKET NOT CONNECTED`. That is a plausible part of the iOS 503 share
`socket_request` shows, which until now had no named cause.

## Decision

1. **`SocketManager` reopens a slot after the SDK's own restart.** On a close classified
   `service_restart` that this client made itself (it passed through `closing`), the manager looks
   again on the next macrotask — after `restart()` has run to its end — and calls `connect()` when the
   same slot is still bound, not being torn down, and still `closed`.
2. **It yields to the wake recovery.** While the foreground kick is reconnecting the slot
   (`hasResumeKick`), the manager does nothing: an overdue rotation and the resume pass can fire
   together, and the kick may be re-seeding an expired controller on the closed socket, which a
   connect from here would race past.
3. **The SDK itself is not changed from this repo**, and the workaround is written to go inert when
   it is fixed: a restart that reconnects leaves the socket `connecting` by the next macrotask.

`connect()` re-arms the reconnect controller on its way out, and the bootstrap gate keeps the new
connection's `device.save:ok` → `auth.update` order, as it does for every reconnect.

## Alternatives

- **Fix the SDK.** The right place, and still wanted: `restart()` should not go through `stop()`. But
  the SDK is released separately, and the gap costs requests in every long session until it is. The
  real-client test fails the day an SDK release fixes it, which is the signal to remove this.
- **Turn rotation off** (`rotationOptions`). The server still ends a connection at its lifetime limit;
  the close then arrives remote, and the reconnect controller, never stopped, does reconnect. But a
  rotation exists to replace the connection before that cut, not after it, and disabling it trades a
  planned reconnect for an unplanned one with requests in flight. Rejected.
- **Give the runtime its own reconnect controller** (`reconnectOptions`), whose `restart()` would not
  stop the client's. Two controllers would then react to every close of one client — two backoff
  schedules, two connect attempts. Rejected.
- **Reconnect inside the close listener, synchronously.** The SDK's `restart()` is still unwinding at
  that point; a connect there would run ahead of it and depend on the order of its remaining steps.
  The next macrotask is after all of them, whatever they are. Rejected.

## Consequences

- A rotated connection comes back within one macrotask plus a handshake instead of at the next
  foreground. Requests in flight across the rotation still fail as 499 `service_restart`; the 503s of
  the gap after it should fall away, on long foreground sessions above all.
- The reconnect reads as `reconnect` in `socket_verify`, and logs one
  `[SocketManager] reopening a socket the SDK restart left closed` line.
- A server close that happened to carry the reason `service-restart` is not reopened by this: it is
  remote, and the reconnect controller (not stopped) handles it with its backoff.
- desktop-web's own wake hook calls a bare `disconnect()`, which stops the controller the same way; a
  bare close is not reopened by this decision. That is a separate fix.
