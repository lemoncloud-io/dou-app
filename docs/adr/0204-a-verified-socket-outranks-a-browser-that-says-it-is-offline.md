# ADR-0204: A verified socket outranks a browser that says it is offline

> Status: Accepted · Decided: 2026-10-15
> · Scope: `libs/app-runtime/src/socket/linkState.ts` and the offline skips in `libs/app-runtime`
> · The module doc is [app-runtime socket](../../libs/app-runtime/docs/socket/README.md)
> · Related: [ADR-0076 (single auth verdict)](./0076-app-runtime-auth-single-verdict-and-typed-session-events.md),
> whose `deriveConnectivity` and relay confirmation window treated `navigator.onLine === false` as proof

## Context

`app-runtime` read `navigator.onLine === false` as proof that the network link was dead. The
connection banner showed "no network" on it whatever the sockets said, and five credential paths
skipped their work on it: the cloud credential guard, the relay staleness guard, the relay
terminal-expiry decision, the background cloud token preparer and the relay keep-alive.

On the macOS desktop shell that value stayed `false` for the life of the process while the network
worked. The shell is a login item; it started while Wi-Fi was still associating, and from then on
main's `net.isOnline()` and the renderer's `navigator.onLine` both read `false` while a same-origin
fetch returned 200 and messages kept arriving. A fresh Electron process of the same version on the
same machine read `true`. Closing the window does not clear it, because the shell hides to the tray
instead of quitting. The user saw a permanent red "no network" banner, and every cloud credential
renewal was skipped, so cloud tokens could expire on a healthy network.

## Decision

**The link is down only when the browser says offline AND no socket slot is verified.** A socket
that is connected and has completed its handshake is positive proof that packets are moving, and it
overrules the browser's flag.

- **One function owns the verdict.** `isLinkDown` is the pure rule, and `isLinkKnownDown` reads it
  live for the imperative guards. `deriveConnectivity` calls the pure rule, so the banner and the
  guards cannot disagree.
- **Any verified slot counts, relay or cloud.** The question is whether the network works, not
  whether the active slot is healthy.
- **The sockets are read only when the browser already says offline.** On a normal online browser
  nothing changes.
- **The relay terminal-expiry decision keeps the raw flag.** Every other skip only decides whether
  to try a renewal, so being wrong costs one failed attempt. That decision ends the session. Right
  after a real drop a cloud socket can still read verified, and letting it overrule the flag there
  could log the user out over a dead link. With a latched flag a wedged relay session stays
  unresolved until the shell restarts, which is the cheaper failure.

## Alternatives

- **Fix only the banner.** It removes the visible symptom, but the credential guards keep skipping,
  and the user's cloud tokens still expire on a working network.
- **Correct the signal in the desktop shell.** Electron has no API to reset Chromium's network state,
  and the shell could only relaunch itself, which is a heavier cure than the bug. It also leaves the
  web build exposed to the same latch in any other Chromium host.
- **Stop reading `navigator.onLine` entirely.** The flag is still right most of the time, and the
  guards would then fire requests, and count failures, on a link that really is dead.

## Consequences

- **A real drop is reported a little later.** When the link really dies, a socket can stay
  `connected` and verified until its next frame fails. For that window the banner stays quiet and the
  renewal guards may try once. As wired today none of them ends the session: the staleness guard
  can tear one down, but no app passes it a teardown or a failure limit. A caller that wires one in
  needs the raw flag, as the relay expiry decision does. The delay is bounded by the socket
  noticing; the latched flag was not bounded at all.
- **A latched flag with no verified socket is still read as offline.** A launch that has no session
  yet, such as the relay keep-alive's guest login, gets no positive evidence and keeps waiting.
- **`libs/http` keeps its own reading.** `isBrowserOffline` in `libs/http/src/utils/browserNetwork.ts`
  still trusts the flag when deciding whether a failure is the credential's fault. That package
  cannot see the sockets.
