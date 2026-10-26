# ADR-0226: A bridge message goes once no current web source sends it

> Status: Accepted · Decided: 2026-10-26 · Implemented: `chore/shell-dead-bridge-code`
> · Scope: `libs/app-messages` (the vocabulary), the shells that answer it (`apps/mobile`,
> `apps/desktop`, `apps/shell-adapter`), `libs/bridges` (`BRIDGE_VERSION`)
> · The module doc is [the app-messages README](../../libs/app-messages/README.md#design-principles),
> rule 4

## Context

`@chatic/app-messages` declares every message that crosses the WebView boundary, and each shell
registers a handler for the requests it answers. Until now the repo's rule for retiring a request
was: **a retired message keeps its declaration and its shell handler until no deployed build calls
it.** The reasoning was the deploy order. The web ships before the app, so an older web build was
assumed to be installed next to the newest shell and still sending the old message; deleting the
handler would turn its reply into `NOT_FOUND`, which shows up as a failure on a screen that used to
work.

That rule could never be met. "No deployed build calls it" had no test, so a retired message stayed
for good. By October 2026 the phone shell answered six requests that no web or desktop-web source
sent any more: the four `*AppLogBuffer` pairs, kept as tombstones that returned an empty buffer
after the ring buffer they read was replaced by the upload queue, and `FetchSafeArea` and
`FetchBackgroundStatus`, which no web build had ever sent. Each one cost a handler, a line in every
shell's contract suite, a row in the handshake's list of supported messages, and code a reader had
to rule out.

The premise behind the rule does not hold for this app. The shells do not ship a copy of the web:
`apps/mobile` loads the web from its server into the WebView, there is no service worker holding an
older bundle, and `apps/desktop` loads desktop-web the same way. Because the web deploys ahead of
the app, the web a shell runs in production is the one currently deployed, never an older one.

An older bundle can run only when someone loads one on purpose. On the phone that is a custom web
zip, which `apps/mobile`'s `customZipGate.ts` allows only while `VITE_ENV !== 'PROD'`, so it exists
on dev and local builds, for testers. The desktop shell has a custom-UI bundle, a proof of concept
that serves a downloaded bundle in place of the remote web; a person has to point it there.

## Decision

1. **A request leaves the vocabulary, with its shell handlers, once no current `apps/web` or
   `apps/desktop-web` source sends it.** That is checked with a grep across `apps/` and `libs/`,
   not by waiting. A request no shell handles may go at any time, as before: a build that still
   sends it already gets `NOT_FOUND`.
2. **A deliberately loaded custom bundle is the accepted exception**: the phone's non-PROD custom
   zip, or the desktop's custom-UI bundle. An older bundle loaded that way that still sends a
   removed message gets `NOT_FOUND`, and that is not a reason to keep the handler for everyone.
3. **Removing a request changes the handshake, so `BRIDGE_VERSION` is bumped**, as for 2.7.0. This
   decision's first use is 2.8.0, which removes the six requests above. `OnBackgroundStatusChanged`,
   which also answered `FetchBackgroundStatus`, stays: the shell pushes it on every app-state
   change, so it becomes a push-only message.
4. **The opposite direction is unchanged.** A web build newer than the installed shell is normal,
   because the app updates through the stores. The web still falls back on `NOT_FOUND` from an
   older shell, and that is a separate question this decision does not touch.

## Consequences

- Dead shell code goes when its last caller does, not never. The vocabulary, the contract suites
  and the handshake list only what something uses.
- A tester on a dev build who loads an older custom zip can hit `NOT_FOUND` on a screen that used to
  work. That screen was built against a message the current web no longer has, so what they are
  looking at is not what production runs.
- The rule now depends on how the shells load the web. If a shell ever ships a web bundle inside
  the binary, or a service worker starts caching one, installed old bundles exist again, and this
  rule has to be revisited before the next removal.
- The grep has to cover both `apps/web` and `apps/desktop-web`; checking only one could remove a
  message the other still sends.

## Alternatives

- **Keep the old rule: hold a declaration until no deployed build calls it.** Rejected. "No deployed
  build" assumed installed old bundles that this app does not have, and it had no test, so nothing
  was ever retired under it.
- **Keep the handlers as tombstones that answer an empty result.** That is what the four
  `*AppLogBuffer` pairs were. It protects only a non-PROD custom zip, and it keeps a handler, a
  contract line and a handshake entry for every retired message indefinitely.
- **Gate removals on a minimum web version reported in the handshake.** Rejected for this case. It
  adds a negotiation in order to protect a bundle that only a tester's override can load, and the
  version is a record that no caller is meant to branch on.
