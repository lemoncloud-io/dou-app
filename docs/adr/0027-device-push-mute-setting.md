# ADR-0027: Device-wide push mute — a kind-scoped socket facade (core) plus a My Page toggle (apps/web)

> Status: Accepted · Decided: 2026-07-23

Related ADRs:
[[0025-channel-notification-mute-toggle]](./0025-channel-notification-mute-toggle.md) (muting one chat room — join.update notify; this ADR is device-wide, a different scope),
[[0011-web-layout-shell-and-floating-bottom-nav]](./0011-web-layout-shell-and-floating-bottom-nav.md) (the My Page shell)

Reference spec (server, already settled):
`chatic-sockets-api/docs/specs/update-remote-device/{00-requirement,01-spec,02-design}.md`

> **Naming note (2026-09-01):** the names this document uses — `*RemoteDataSource`,
> `RemoteGatewayBundle`, `*DomainGateway`, `remoteFactory`, `remote/data-sources/` — are **the names of
> the time**. The mapping to the names after the socket axis moved behind the `Socket` prefix is in
> [libs/data/docs/remote/README.md](../../libs/data/docs/remote/README.md#naming-history). This is a
> record, so the body is left as it was.

## Context

There is no way for a user to turn device-wide push notifications on and off. This mute (`muted`) is
owned by `chatic-pushes-api`, and since sockets-api knows how a connection maps to a device, the socket
action `device.update-remote` updates `muted` for "the currently connected device" on its behalf.

A library upgrade opens that path:

- `@lemoncloud/chatic-sockets-lib` `0.4.6 → 0.4.8` — adds `DeviceGateway.update-remote`
  (`updateRemote`).
- `@lemoncloud/chatic-sockets-api` `0.26.703 → 0.26.704` — the socket action `device.update-remote`,
  input `{ muted: boolean; id? }`, response `PushDeviceView` (which includes muted).

**The server contract in short** (source of truth = the spec above):

- `muted` (boolean) is **required**; omitting it is a 400. `id` is optional — without it the server uses
  the deviceId attached to the connection.
- The response passes `PushDeviceView` through (reflecting the requested muted). **Write only — reading
  muted is outside the server's scope.**
- Failures (4xx/5xx/timeout) propagate through the socket `:error`.

**The front-end architecture constraints the survey found (the important part):**

- Every gateway binds to `SocketManager`'s **active-slot facade**
  (`libs/app-runtime/src/data/factories/socketFactory.ts:21-26` — now `socketFactory.ts`,
  [SocketManager.ts:239](../../libs/app-runtime/src/socket/SocketManager.ts)). `request()` always goes
  to the active slot — **the cloud slot whenever a cloud is on**.
- So calling lib 0.4.8's `DeviceGateway.updateRemote` through the existing device gateway would go out
  over the cloud socket while a cloud is active, **violating the "request from relay only"
  requirement**.
- `SocketManager` owns two slots, `relay` (always on) and `cloud` (only while active), and the one
  escape hatch that names a slot is `getClient(kind)`
  ([SocketManager.ts:124-129](../../libs/app-runtime/src/socket/SocketManager.ts)). The only precedent
  for forcing relay is in the auth layer (logoutSession, reauthenticateActiveSocket), and both bypass
  the facade with `getClient('relay')`.
- **Nothing in the front end reads `muted`** — `device.read` returns the local device model (no muted),
  and the push token registration response (HTTP `reg-dev`) has no muted either.

## Decision

Add the device-wide push mute toggle to My Page, but build it **as the first domain on top of a
reusable core primitive rather than one-off device wiring**. Firing an API over the relay (or another
named kind) socket while a cloud is active will keep coming up, so that capability becomes a
first-class core facility and the domain sits on it.

### Layering

- **Core (owned by app-runtime / SocketManager) — the one reusable asset**
    - Add `SocketManager.getScopedClient(kind: SocketKind): ISocketClient`. It returns **a stable facade
      pinned to that kind** which **resolves lazily** through `getClient(kind)` on every
      `request` / `send` / `onType` call (so it picks up the current slot client even after an ensure
      teardown and rebuild). It is **symmetric** with the existing active-slot facade
      (`ISocketManager.request` = the active slot), so "active / relay / cloud" facades now sit side by
      side.
    - That one addition covers every kind-specific request: relay-while-cloud, cloud-specific and the
      rest. With no slot (an unbound relay, say), the call throws clearly.
- **Routing (libs/data) — a destination-neutral skeleton over the facade**
    - The destination is **not pinned to a domain**. Add a `SocketRoute = 'active' | 'relay' | 'cloud'`
      type and a `routed(create)` helper that binds the same gateway to each kind's facade and groups
      them as `Record<SocketRoute, Gateway>` (active = the manager, relay/cloud =
      `getScopedClient(kind)`). Because the facade resolves lazily, three instances are cheap and carry
      no staleness risk.
    - Data-source and repository methods take **a `route?: SocketRoute` argument (default `'active'`)**
      and pick the matching instance. The data layer stays **neutral** about the destination; **the
      caller (web) decides** where a request goes.
    - A new routing case then needs no core or gateway change — just expose a `route` argument on that
      method.

### In scope

1. **Library upgrade**: `chatic-sockets-lib@0.4.8`, `chatic-sockets-api@0.26.704`.

2. **Core: the kind-scoped socket facade** — `getScopedClient(kind)` from the Layering section. This
   round fully supports `request` and `send` only. Surviving a rebind for `onType` (as complex as the
   owned-subscription rebinding the active facade does) stays a **documented extension point** for when
   a relay-push consumer actually appears (today it is unimplemented — an explicit throw or a stated
   no-op).

3. **The routing skeleton (libs/data)** — `SocketRoute` plus `routed()` plus the method `route` argument
   (default `'active'`).
    - device is its first consumer: `DeviceRemoteDataSource.updateRemoteDevice({ muted }, route?)` and
      `DeviceRepository.updateRemotePushMute(muted, opts?: { route })`.
    - The existing device gateway (save / read / **sync**) **stays on active** — viewing and presence
      (sync) have to follow the currently active server, so their destination does not move.

4. **Input**: the client sends `{ muted }` only. It does not send `id`, letting the server resolve the
   deviceId from the connection (minimising the IDOR surface).

5. **UI (apps/web/src/app/features/mypage) — "relay only" is enforced here**:
    - One `Switch` row in My Page's Settings `MenuCard` (the same pattern as dark mode and message
      preview).
    - The label means "receive notifications" — **toggle ON = receive = `muted: false`** (muted is
      inverted for display).
    - A dedicated hook, `useDevicePushMute`, calls
      `updateRemotePushMute(muted, { route: 'relay' })`, so **the caller names relay**. `route: 'relay'`
      is **fixed as a constant in the hook and pinned by a test**, so it cannot leak back to the data
      layer's default (active).

6. **Initial state and reconciliation**: with no standalone muted read, assume **ON by default (receive,
   `muted: false`) before the first write**. But the `device.update-remote` **response carries the
   authoritative `muted`, so a write doubles as a read** — each toggle applies optimistically and then
   reconciles to the response's `muted` on success (falling back to the requested value if absent). Only
   the state before the first write is an assumption; after that the server is the truth.

7. **Guests included**: shown to **everyone**, signed in or not. Push is device-scoped, and the relay
   slot exists for guests too.

8. **Offline and unverified behaviour**: the toggle is **always allowed** (optimistic), and a failed
   request **rolls back to the previous value and raises an error toast**. It does not pre-block on
   `isKindVerified('relay')`.

### Out of scope

- Updating device settings other than `muted` (status, deviceToken, platform, endpoint).
- Adding a server-side **read (read-remote)** path for muted — this round assumes ON by default in the
  front end.
- Changing per-channel notifications (notify, [ADR-0025]) — a separate axis.
- Client-side notification rendering or filtering (apps/web depends on server push).
- Whether muted actually affects push fanout — that is pushes-api's responsibility, outside this
  contract.

## Alternatives

- **(Dropped) One-off relay-only device gateway wiring** — add a relay facade and gateway bound to
  device alone. Simpler right now, but relay-while-cloud requests will certainly recur, so similar
  wiring would accumulate each time. → Generalised by raising the kind-scoped facade into a **core
  primitive** with device as its first consumer (the author's point).
- **(Dropped) Pin the destination to the domain (`bundle.relay.device`)** — the draft put a relay-pinned
  gateway in a relay namespace. But the same method is expected to go to relay or cloud depending on the
  situation → the destination moves into **a `route` argument at call time** and the data layer stays
  neutral. The default route is `'active'`, and the policy belongs to the caller (web) (the author's
  point).
- **(Dropped) An app-runtime runtime escape helper** — call
  `getSocketManager().getClient('relay').request('device.update-remote', ...)` straight from the hook,
  like logoutSession. Minimal change, but it skips the gateway and repository layers and scatters lazy
  resolution and reuse across every call site. → The core facade wins.
- **(Dropped) Move the whole device gateway to relay** — sending save / read / sync over relay breaks
  viewing and presence sync, which must follow the active cloud. → Only update-remote is relay-pinned.
- **(Held) Promote `getScopedClient` into a slot-specified request on `ISocketManager`** — that is
  `manager.request(type, data, { kind })` rather than a facade object. Gateways are designed to take a
  single client, so a facade object wires more naturally. Revisit if relay-only writes grow (see the
  revisit triggers).
- **(Dropped) Add a server read-remote and sync the initial state** — better consistency, but it needs
  the server's scope widened. By the author's decision this round simplifies to ON by default (listed
  under revisit triggers).
- **(Dropped) Hide it from guests / disable it while unverified** — as a device-scoped setting it is
  shown to everyone and allowed optimistically.

## Consequences

**What is gained**

- Device-wide push mute updates consistently over relay, whether or not a cloud is active.
- With **the kind-scoped facade (core) plus the route argument (routing)**, the caller picks the
  destination freely. The next relay- or cloud-specific API needs no core or gateway change — just a
  `route` argument on that method. That is the standard path for the recurring relay-while-cloud case.
- Because the data layer is destination-neutral, the same domain method is reusable over relay, cloud or
  active as the situation requires.
- The layers (core facade → routed gateway → data source → repository → hook) are unit-testable.

**Trade-offs and risks accepted**

- **"Relay only" became a caller convention rather than a data-layer guarantee.** With `'active'` as the
  default route, a push-mute hook that forgets `route:'relay'` leaks quietly to the cloud → mitigated by
  the constant in the hook plus a test (In scope 5).
- **Only the state before the first write can disagree with the server.** With no standalone read, ON is
  assumed from boot until the first toggle. Every write reconciles against the response's authoritative
  `muted`, so one toggle converges to the server value (the drift window shrinks to before the first
  write). (Revisit trigger 1.)
- If the kind-scoped facade does **not resolve lazily**, it risks holding a stale client after a slot
  rebind → mandatory in the core implementation, pinned by a test.
- **`route:'cloud'` with an unbound cloud slot throws at request time** (it does not silently fall back
  to active). That is a deliberate failure so that "it went to cloud" means what it says — callers name
  cloud only where cloud is meaningful.
- The core facade's **`onType` is incomplete** (request and send only) — a partial implementation until
  a relay-push consumer exists. An explicit throw or no-op plus documentation prevents misuse
  meanwhile.
- The unvalidated `input.id` IDOR is a risk the server accepted (`device.*` is unguarded). The client
  minimises the surface by not sending an id.
- SocketManager and the facade belong to the web runtime (app-runtime), so the testbed reference
  implementation has to stay aligned ([[web-runtime-migration]]).

## Revisit triggers

- If user confusion (the toggle showing something other than reality) becomes a problem → add a server
  **muted read-remote** path and revisit the initial sync.
- If pushes-api's `PUT /devices/<id>` turns out to replace rather than patch → revisit how the client
  builds the body (in step with the server spec).
- If relay-only writes multiply → consider promoting the relay-pinned facade into a first-class
  `ISocketManager` API (a slot-specified request).

## Addendum (2026-07-23) — the route argument is withdrawn; the destination is pinned in the data source

In use, the original decision's risk ("a caller that forgets `route:'relay'` leaks quietly to active")
proved to be a standing cost, so **"the caller decides the destination" is partly withdrawn**:

- `DeviceRemoteDataSource.updateRemoteDevice(payload)` now **pins relay itself**, and the repository and
  hook's `route` argument, the `PUSH_MUTE_ROUTE` constant and the leak-prevention test are gone. By
  contract, update-remote has exactly one destination (relay, because pushes-api sits behind relay), so
  exposing a choice on a method that has no choice was speculative generality that only added a way to
  get it wrong.
- **The core `getScopedClient(kind)` and the routed gateway bundle stay** — the reusable primitive
  reaches as far as the core. When a second consumer appears whose destination really does vary per
  call, `route` is exposed on that method alone (S4).
- The same cleanup removed `ScopedSocketClient`'s unimplemented `onType` (which always threw) from the
  type surface — it comes back when a consumer exists (the extension point stays documented).

Related: the design principles in `libs/app-runtime/docs/socket/kind-scoped-routing.md` were revised.
Also, a non-shell (ordinary browser) has no push device in pushes-api, so the write 404s — the My Page
toggle renders disabled, gated on `isSupported` (`CHATIC_APP_PLATFORM`), with a note that it can only be
set in the app.
