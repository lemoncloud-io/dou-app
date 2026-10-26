# socket-lab

**A multi-participant WebSocket lab, not another single-connection session.**
[`apps/testbed`](../../../testbed/README.md) runs one full-stack session; `socket-lab` runs
**several independent client sockets side by side**, each joining the server as its own device, and
shows their traffic, sync and timings on one screen — the multi-device situations a single session
cannot reproduce. It is the app's landing route (`/` redirects to `/socket-lab`). Feature code:
`apps/admin-v2/src/app/features/socket-lab/`.

The screen has two tabs:

- **Observe** — a watchlist of other users' devices, kept live by polling. Its sync strategy is in
  [observe.md](./observe.md).
- **Probe** — the lab itself, in two modes: **Sandbox** (real sockets, described below) and
  **Load** (a simulation, see § Load mode is a model).

## Why raw sockets, not the runtime's

Every Sandbox client calls `createClientSocketV2` from `@lemoncloud/chatic-sockets-lib` directly
(`runtime/client-container.ts`), wrapped by one `SandboxController` per client
(`runtime/sandbox-controller.ts`). None of them goes through the socket `@chatic/app-runtime` holds:
that one belongs to the signed-in admin session and is shared by the whole app, while this feature
exists to run several sockets that are nobody's session. Each client owns its own socket, device
runtime, stores and metrics collector — there is no shared state between clients by design. The
Sandbox holds up to four clients, lettered A to D, and starts with two.

Connecting and authenticating are separate steps. Connecting registers the client's device
(`device.save`) and needs no token. Authentication is manual — the operator pastes a token and the
client sends `auth.update` — and a failure leaves the connection up so it can be retried. Channel
and chat actions wait for an authenticated client. This is a lab tool inside admin's existing login
gate, not a new auth flow — it adds no sign-in code of its own.

## What Sandbox measures

- **Request RTT** for every request a client sends, and the **handshake** time of its connection.
- **Send and receive latency** of chat messages. The server does not echo custom fields, so the
  sender appends a marker to the message content — sent-at time, clock origin, sender letter and a
  sequence number — and the receiver parses it back out. The clocks only compare within one browser
  (the same `performance.timeOrigin`), which every Sandbox client shares.
- **A cross-client latency matrix** (`A>B`, `B>A`, …) from those same markers.
- **Loss**: a gap in one sender's sequence numbers is counted as messages lost on the way.

A client only receives `chat.sync` for a channel it has declared it is viewing, so joining a
channel with sync on declares viewing for it as the active channel. Where the server does not push `chat.sync`, the client
falls back to reading `chat.feed` whenever channel sync shows the channel's `chatNo` has moved — so
messages still arrive, a polling interval late.

The client container can also drop the next N incoming `chat.sync` messages on purpose
(`shouldHandleMessage`) to simulate loss; no screen arms it today.

## Load mode is a model

Load mode opens **no sockets**. `hooks/use-load-test.ts` produces its live curve, histogram and
verdict from a latency model with random noise, driven by the configured subscribers, publishers,
rate, payload and ramp. Its numbers describe that model, not the server — the screen is a layout
for a load report, not a load test. Its "gap-drop inject" toggle only changes the simulated report.

## Out of scope

Grouping devices by user (the device data has no user join key today — the server would need to add
one); any new login/auth/signing flow; production support (this is a dev-only tool); adding or
changing backend APIs; load-testing at scale (the Sandbox is built around a few manually operated
clients, not stress-testing rate limits or browser WebSocket ceilings).

## Documents

- [observe.md](./observe.md) — the Observe tab's live device-sync strategy
