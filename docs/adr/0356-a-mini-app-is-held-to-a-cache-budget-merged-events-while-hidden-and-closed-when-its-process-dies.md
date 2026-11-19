# ADR-0356: A mini app is held to a cache budget, its events merged while hidden, and closed when its process dies

> Status: Accepted · Decided: 2026-11-19 · Implemented: `feat/sub-webview-resource-limits`
> · Scope: `apps/mobile/src/app/subWebView/` (`subWebViewReadBudget.ts` — `SUB_WEBVIEW_CACHE_READS`;
> `subWebViewRuntimeAccess.ts`; `subWebViewRuntimeBridge.ts` — the cache budget, the held events;
> `SubWebView.tsx` — the process callbacks) · `libs/bridges` (`BRIDGE_VERSION` 2.31.0) ·
> `libs/chatic-apps-sdk` (`SDK_BRIDGE_VERSION`)
> · The specification is [apps/mobile docs/webview/mini-app-protocol.md](../../apps/mobile/docs/webview/mini-app-protocol.md#runtime-reads)
> · Related: [ADR-0320](./0320-a-sub-webview-page-reads-the-current-cloud-through-a-whitelist-of-runtime-requests.md)
> (the reads and their server budget), [ADR-0325](./0325-a-sub-webview-page-may-send-a-text-message-to-a-room-of-its-place.md)
> (the send budget)

## Context

A review of what a mini app can make the app spend found four open edges, all in the page host:

- **Cache reads had no limit.** Server reads and sends are budgeted per view; reads of the device cache
  were not, on the reasoning that the server is what a page could flood. But a cache read runs on the
  app's own JavaScript thread: a page reading a cache list in a loop keeps that thread serializing rows,
  and the user's own screens wait behind it.
- **Events piled up while the app was in the background.** On Android nothing reaches a WebView's page
  while the app is not in front (the runtime's pushes are delivered on return, all at once), and the
  page's streams kept producing events meanwhile.
- **A page whose process died left a blank view.** A full-screen game is the kind of page the OS ends
  for memory; nothing handled `onContentProcessDidTerminate` or `onRenderProcessGone` for the view.
- **Two limits had never been stated:** what a stream sends each time, and how much the host holds for
  a page that has not spoken yet.

## Decision

1. **Cache reads get a budget of their own**: 600 a minute per view, with no spacing between them, apart
   from the server-read and send budgets. Over it a read answers `RATE_LIMITED` with `retryAfterMs`, as
   the other two do. It covers calls and streams whose whitelist cost is `local`, and every room check
   the shell reads the cache for on a page's behalf, one per room — a message's included — so neither a
   list of a thousand rooms nor a loop of sends to rooms that are not there reads the cache for free. No spacing, because a page that opens reads a room, its members and its
   messages at once, as DoU's own screens do; the ceiling is for a loop.
2. **While the app is in the background, each stream keeps only its latest event.** Not while it is
   merely `inactive` (a system prompt, the app switcher), which passes in a moment. Every stream the
   whitelist opens sends the whole of what it watches each time (a list as it stands, a row or `null`,
   every room's last message, every covered range), never a change, so the newest event stands for the
   ones before it. A stream's end replaces what it held. On return they go out in the order they last
   changed. A stream the page closed meanwhile delivers nothing, and a hello or the end of the page load
   drops what was held. Session pushes are left as they are: they are few and carry a sequence the SDK
   checks.
3. **A page whose process died closes the view as `system`**, with no reload. The main WebView reloads
   in that case because it is the app; a mini app that ran the device out of memory once would only do
   it again. `system` is an existing close reason, so the opener needs nothing new. The exception is iOS
   ending the process while the app is in the background, which WebKit does to any page for the
   system's memory, not for anything the page did: the view reloads once then, and closes only if it
   happens again. Android is not excepted: a WebView whose renderer is gone cannot be used again.
4. **The two unstated limits are written down, not changed.** One event or answer is at most 4 MiB of
   JSON; over it an answer fails and a stream ends with `RUNTIME_PAYLOAD_TOO_LARGE`. Pushes held before
   a page's first message have no ceiling and need none: before then only a context change can be
   pushed, since every other push answers something the page sent.
5. `BRIDGE_VERSION` goes to 2.31.0 — 2.30.0 being the context's display and safe area, decided apart —
   and the SDK's constant with it. Nothing is added to the vocabulary; `RATE_LIMITED` and `system`
   already existed.

## Alternatives

- **Spacing on cache reads too**, as for server reads. Rejected: it would slow a page's first screen,
  which reads several things at once, to protect against a loop the minute ceiling already stops.
- **Pause streams while hidden** (unsubscribe, resubscribe on return). It would also stop the work
  of producing events, but a stream's first event after resubscribing is a fresh read the page did not
  ask for, and the page would see its `seq` restart. Keeping the latest event costs one row per stream.
- **Merge only on Android**, where the backlog happens. iOS delivers in the background, but a page in
  the background has nothing to draw; one rule is simpler to state.
- **Reload a page whose process died**, as the main WebView does. Rejected for the reason above, and a
  reload would lose the page's state anyway.
- **Lower the 4 MiB limit.** It is already a published limit; narrowing it would break a page that
  works today.

## Consequences

- A page MUST NOT count on consecutive `seq` numbers in a stream; it can drop any event but the latest.
- A page that reads its cache in a loop sees `RATE_LIMITED` it never saw, and has to wait out
  `retryAfterMs`.
- 600 a minute is a judgement, not a measurement of DoU's own screens.
- The user loses a page whose process died in front of them, and the opener hears `system` as for a
  deep link. A page iOS ended in the background comes back reloaded: what it had not saved is gone.
- An app release is needed before any of it reaches users.
