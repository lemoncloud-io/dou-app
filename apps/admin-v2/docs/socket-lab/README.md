# socket-lab

**A multi-participant WebSocket lab, not another single-connection observer.** admin-v2 already had
two socket tools before this one, and neither covers what this does: `socket-test` is one admin
socket watching and disconnecting someone else's device (an observer), and
[`apps/testbed`](../../../testbed/README.md) is a single full-stack session. `socket-lab` spins up
**N independent client sockets**, each joining the server as a real device/user, and watches their
interaction, sync and metrics on one screen — reproducing multi-device/multi-user situations neither
other tool can. It is the app's landing route (`/` redirects to `/socket-lab`). Feature code:
`apps/admin-v2/src/app/features/socket-lab/`.

## Why raw sockets, not the shared wrapper

Every client is built on `createClientSocketV2` called directly — never `@chatic/socket`'s
`useWebSocketV2` wrapper. That wrapper is a module-level singleton, one socket per app; this feature
exists specifically to run several sockets at once, so the singleton is the one piece of the stack it
cannot reuse. Each client instance owns its own socket, runtime, store and metrics collector — there
is no shared global state between clients by design.

Authentication is manual per client: the operator supplies a token directly (`auth.update`), rather
than the client deriving an identity on its own. This is a lab tool operating inside admin's existing
login gate, not a new auth flow — it adds zero sign-in code of its own.

## What it measures

- **End-to-end latency and RTT**, collected per client from the moment a message is sent.
- **Gap-drop / catch-up**: a client can be told to deliberately drop the next N incoming `chat.sync`
  messages (`shouldHandleMessage`), simulating message loss, and then verified against the server's
  own `device.sync` snapshot — since that snapshot is the ground truth, no separate comparison source
  is needed. Recovering to a matching snapshot within a couple of sync cycles is what "catch-up"
  means here.
- **Device sync snapshots** (tracked/viewing/pointer) per client, and an inventory panel aggregating
  device/channel state across every client the lab has spun up — this inventory is the lab's own
  ephemeral view, not a call to the admin device-list API.

## Out of scope

Grouping devices by user (the device data has no user join key today — the server would need to add
one); any new login/auth/signing flow; production support (this is a dev-only tool); adding or
changing backend APIs; load-testing at scale (the lab is built around a small, manually operated
number of concurrent clients, not stress-testing rate limits or browser WebSocket ceilings).

## Documents

- [observe.md](./observe.md) — the Observe tab's live device-sync strategy
