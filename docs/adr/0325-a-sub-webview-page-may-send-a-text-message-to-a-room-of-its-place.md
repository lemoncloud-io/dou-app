# ADR-0325: A sub WebView page may send a text message to a room of its place

> Status: Accepted · Decided: 2026-11-16 · Implemented: `feat/mini-app-runtime-chat-send`
> · Scope: `libs/bridge-messages` (`model/sub-webview.ts` — the `chatSend` permission) · `libs/bridges`
> (`BRIDGE_VERSION` 2.27.0) · `libs/runtime-core/src/bridge/subWebViewWhitelist.ts` (`chat.sendChat`,
> the `argCount`, `onlyFields` and `text` argument guards, `roomInCurrentPlace`) and `host.ts` (no call
> after close) · `apps/mobile/src/app/subWebView/` (`subWebViewRuntimeBridge.ts` — the room check, the
> place binding and the send budget; `subWebViewRuntimeAccess.ts`; `subWebViewReadBudget.ts`;
> `subWebViewRuntimeConsent.ts` — per place; `subWebViewRuntimeConsentPrompt.ts` — the question) ·
> `libs/chatic-apps-sdk` (the version, the mock)
> · The behaviour is documented in [apps/mobile docs/webview/sub-webview-protocol.md](../../apps/mobile/docs/webview/sub-webview-protocol.md#runtime-reads),
> [libs/runtime-core docs/bridge](../../libs/runtime-core/docs/bridge/README.md#a-sub-webview-page-a-whitelist-of-reads)
> and [libs/chatic-apps-sdk README](../../libs/chatic-apps-sdk/README.md)
> · Amends: [ADR-0320](./0320-a-sub-webview-page-reads-the-current-cloud-through-a-whitelist-of-runtime-requests.md)
> decisions 2, 5, 8, 9 and 10 — one write, under a seventh permission, with a check and a budget of
> its own; decision 5's table opens 30 methods

## Context

ADR-0320 opened the current cloud to a reviewed page as reads only, so a page could show what is in a
cloud but take no part in it. A page that runs a game in a chat room — players call numbers in the
room, the page referees — could watch the room, but its own player could not call a number without
leaving the page, and the page could not announce a result. Everything such a page needs to say is a
line of text the user could have typed into the room themselves.

## Decision

1. **One write, `chat.sendChat`, under a permission of its own, `chatSend`.** None of the six read
   permissions opens it, and `chatSend` opens nothing else. A page declares it in its manifest like
   the others.
2. **Plain text, nothing else a message can carry.** The request carries one argument (the new
   `argCount` guard, so a parameter `sendChat` gains later is not open until it is decided), a plain
   object holding only `channelId` and `content` (the new `onlyFields` guard), and each must be a string
   with something besides white space in it, the room id at most 200 characters and the content at
   most 1,000 (the new `text` guard). That
   leaves out attachments, mentions, replies, a content type, system and webhook rows, and the
   internal flags. A message that fails any of it is refused with `guard`.
3. **A room of the place the view opened on.** The room must be one this device holds, in the cloud
   and the place the view opened on, and the session must still be on that place. Which rooms those
   are is known from the device cache only, so the pure whitelist marks the entry
   (`roomInCurrentPlace`) and the shell reads the room through the page load's own runtime host before
   it lets the message go. A room in another place, one the device does not hold — left, or never
   joined — or any room once the user moved to another place, is refused with `guard`; a read that
   fails answers its own error. Reads stay free to cover the whole cloud: only the message is held to
   the place. The server still decides whether the user may post in the room.
4. **Nothing goes out from a closed view.** The checks can wait — on the consent question, on the
   cache — so right before the runtime is asked the shell looks again: a view closed meanwhile answers
   `RUNTIME_NOT_STARTED`, and a cloud changed meanwhile `CLOUD_CHANGED`. The runtime host itself runs no
   call once it is closed.
5. **A send budget apart from the reads**: one message per 500 ms and 30 a minute, per view. A page
   that reads hard can still send, and a page that sends cannot crowd out its reads. Over it, the
   message is refused with `RATE_LIMITED` and `retryAfterMs`.
6. **Asked for by name, and per place.** When a page's permissions include `chatSend`, the consent
   question's title says the page wants to send messages, its text says they go out in the user's name
   to this place's rooms, and the "it cannot change anything" line is dropped. The yes is kept per
   place as well as per user, page and cloud, so it never covers a place the user was not asked
   about. A yes given before the page asked for `chatSend` does not cover it: the page is asked
   again.
7. **The message is the user's, unmarked.** It goes out through the same repository call the user's
   composer makes, so it reaches the room, the cache and every member exactly as a typed message does.

## Alternatives

- **Keep pages read only, and have players type into the room.** A referee page works that way, and it
  is still the fallback for a page without `chatSend`. But the player holding the page has to leave it
  to play, and nothing can announce the result.
- **Open `chat.sendChat` under `chat`.** Rejected: a user who agreed to let a page read messages did
  not agree to let it post them, and a page that only reads should not be one manifest word from
  posting.
- **Mark a page's message as sent by the page.** The message model has no field a client may set for
  that — `meta` is the backend's internal webhook field — so a mark needs the backend first. Taken up
  if pages that send become common; until then the consent question and the reviewed tier are what
  stand between a page and the user's name.
- **Let a page name any room the user is in, in any place of the cloud.** Rejected for now: a page
  opened in one place has no reason to post into another, and the place check costs one cache read.
- **Ask once per cloud, as for the reads.** Rejected: the question names "this place's rooms", and a
  yes that then reached every place of the cloud would say less than it does.

## Consequences

- A reviewed page with `chatSend` and the user's yes can post text in the user's name, to the rooms of
  the place the user is on. Other members cannot tell those messages from typed ones.
- The whitelist's rule "read only, in what it does" now has one written exception; the spec typecheck
  allows exactly one method named like a write and exactly one entry budgeted as a send, so a second
  write has to be argued the same way.
- A page holding only `chatSend` gets the runtime requests and a hello with no session; it needs a read
  permission to learn a room's id, or the room from its launch parameters.
- The send waits for the device's own send to finish, optimistic row and all, so a page sees the same
  failure the composer would — and a failed send leaves what the composer's leaves: a failed row in the
  room, in the user's name, on this device.
- A user who moves to another place under an open view stops the page's messages there; the page can
  still read, and a new view in that place asks again.
