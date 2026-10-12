# ADR-0186: The handshake lists what the shell answers

> Status: Accepted · Decided: 2026-10-12 · Implemented: `fix/bridge-handshake-supported-messages`
> · Scope: `libs/bridges/src/app/AppBridgeHost.ts` (the `WebAppReady` reply, `Ping`) ·
> `apps/desktop/src/main/bridgeHandlers.ts` (`SavePreference`) · the two shell contract suites
> (`useWebMessageRouter.contract.test.ts`, `bridgeHandlers.contract.test.ts`)
> · The module doc is [libs/bridges README](../../libs/bridges/README.md#2-the-handshake)
> · Amends: [ADR-0155](./0155-the-viewer-offers-save-and-share-when-the-handshake-lists-both.md)
> — the gap between the message map and the handlers is now closed in the bridge, not by a router test
> · Related: [ADR-0123](./0123-picking-a-photo-sends-it-and-the-shell-decides-how-it-is-picked.md),
> whose reasoning named the same gap; [ADR-0120](./0120-performance-traces-move-to-firebase-performance.md),
> which reads the same list

## Context

The `WebAppReady` reply carries `supportedWebMessages` and `supportedAppMessages`, typed as the
requests the app can handle and the replies it can send. `AppBridgeHost` filled them from the keys
and values of `WEB_MESSAGE_RESPONSE_TYPE` — everything the shell was compiled against, whether or not
it registered a handler. The desktop shell answered 7 of the 105 requests and advertised all of
them.

Two web features decide from that list: photo save and share (ADR-0155) and where performance traces
go (ADR-0120). Both worked because the shell that runs them, mobile, happens to register the
messages they look for. ADR-0123 and ADR-0155 each cited the list's untruthfulness as a reason not to
rely on it, and ADR-0155 closed the gap with a test in the mobile router instead.

The per-shell contract suites added before this change now say, for every request, whether a shell
answers it. They surfaced two more mismatches. `Ping`, which the web's debug overlay sends to check a
round trip, was answered by neither shell. And `@chatic/theme` posts `SavePreference` on every mount
and theme change in `apps/desktop-web`, which the desktop shell answered `NOT_FOUND`.

## Decision

**The handshake lists the requests the host has a handler for when it builds the reply, and the
replies paired with them.** The list is read from the host's handler table, so the contract suites,
which already decide every request per shell, now also assert that the handshake over an
`InMemoryAdapter` loopback lists exactly the handled ones.

- **Registration is now part of the contract.** A shell registers before the page can send
  `WebAppReady`. Both do today: mobile in the router's mount effect, desktop while it creates the
  window. A handler added after a handshake is answered but not advertised until the next one.
- **`supportedAppMessages` stays replies only.** Pushed events were never in it. Listing them would
  need each shell to declare what it pushes, which no consumer has asked for.
- **`AppBridgeHost` answers `Ping` itself**, with a `Pong` carrying the payload back. It is a probe of
  the transport, so it belongs to the host every shell already shares, not to each shell's handler
  table.
- **The desktop shell answers `SavePreference`, and stores nothing.** The theme lives in the
  renderer's `localStorage` there, and nothing in the main process reads it. A request desktop-web
  really sends, on every mount and theme change, is decided as handled rather than drawing an
  `ERROR` reply each time. The post is not gated off at the source because `apps/desktop-web` sends no `WebAppReady`: that mount-time post is the
  first non-log message a fresh window sends, and so the one that releases the events the host
  buffered before the page could hear them (an update prompt from the launch check, a re-minted FCM
  token). A signed-out window has no other early request.
- **`BRIDGE_VERSION` is `2.6.0`**, the capability surface having changed meaning.

## Consequences

- On mobile the lists shrink to the 96 handled requests. The photo-save, share and trace
  messages are still in them, so no web behaviour changes there. On desktop they shrink to 9 (7 in
  an unpackaged build, which registers no updater handlers); `apps/desktop-web` does not read them.
- A web build still has to work against an app from before `2.6.0`, whose list names the whole map.
  Every web consumer of the list keeps its `NOT_FOUND` fallback, and the comments and docs that
  called the list untrustworthy now say it is so for those older apps only.
- A fake shell built on the real `AppBridgeHost` — the web E2E suite proposed alongside this change
  builds one — advertises only what a scenario registers. A scenario that needs the viewer's save and share buttons has to
  register both handlers before the page loads.
- Desktop's `SavePreference` reply says `success: true` for a write it did not make. That reads as
  "accepted", and is honest only while no desktop consumer reads the preference back; `FetchPreference`
  stays unsupported there, so nothing does.

## Alternatives

- **Gate `@chatic/theme`'s post on the handshake listing `SavePreference`.** The fix that keeps the
  shell unchanged. `apps/desktop-web` never handshakes, so there is no list to gate on, and adding a
  handshake to it is a change to its boot of its own. Without the post, the desktop host would keep
  its buffered events until the window's first request.
- **Leave `SavePreference` unsupported on desktop and let it draw `NOT_FOUND`.** Changes no
  behaviour and avoids a `success: true` for a write nobody made. Rejected because the unsupported
  lists exist for requests a shell's web does not send; a request desktop-web sends on every mount
  listed there would make "unsupported" also mean "sent and ignored", the case the contract suites
  are there to rule out. Answering it costs one reply per mount or theme change, which the
  `NOT_FOUND` already cost.
- **Keep the lists as the whole map and document them as "what the shell knows about".** Leaves the
  two web consumers correct only by mobile's coincidence, and the next one would have to rediscover
  why it cannot trust the list.
- **Declare each shell's capabilities in a static list passed to the host.** A second source of truth
  beside the handler table, which the contract suites would then have to hold in step with it.
- **Answer `Ping` in each shell's own handlers.** Two copies of a reply that depends on nothing the
  shell owns.
