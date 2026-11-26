# ADR-0357: A mini app may react to a message of its place

> Status: Accepted · Decided: 2026-11-19 · Implemented: `feat/sub-webview-reaction`
> · Scope: `libs/bridge-messages` (`model/sub-webview.ts` — the `chatReact` permission) · `libs/bridges`
> (`BRIDGE_VERSION` 2.32.0) · `libs/runtime-core/src/bridge/subWebViewWhitelist.ts` (`chat.setReaction`,
> the `reaction` and `oneOf` guards, `messageInCurrentPlace`, the `react` cost) ·
> `apps/mobile/src/app/subWebView/` (`subWebViewRuntimeBridge.ts` — the message's room and the reaction
> budget; `subWebViewRuntimeAccess.ts`; `subWebViewReadBudget.ts`; `subWebViewRuntimeConsent*` — per
> place, the question) · `apps/mobile/src/app/services/subWebView/subWebViewManifest.ts` ·
> `libs/chatic-apps-sdk` (the version)
> · The specification is [apps/mobile docs/webview/mini-app-protocol.md](../../apps/mobile/docs/webview/mini-app-protocol.md#runtime-reads),
> [libs/runtime-core docs/bridge](../../libs/runtime/docs/remote/README.md)
> · Related: [ADR-0325](./0325-a-sub-webview-page-may-send-a-text-message-to-a-room-of-its-place.md)
> (the first write, whose form this follows), [ADR-0347](./0347-a-mini-app-reads-only-the-place-its-view-opened-on.md)
> (the place binding)

## Context

ADR-0325 opened one write to a mini app, a plain text message, and said a second would have to be argued
the same way. The whitelist's type test holds that line by name: nothing allowed may be named like a
write but `chat.sendChat`, and nothing may be budgeted as a send but it.

A reaction is the next write mini apps ask for: a poll counts votes as reactions, a game marks a move,
a bot page acknowledges a message. It is small — one emoji on one message — but unlike the text send
its argument names no room, only a message id (`<room>:<number>`), and the server applies it to
whatever message that is.

## Decision

1. **`chat.setReaction` opens under a permission of its own, `chatReact`.** Neither `chat` nor
   `chatSend` opens it, and it opens no read: a page reads the messages it reacts to with `chat`.
2. **One shape.** One argument, a plain object with `chatId`, `emoji` and `action` and nothing else.
   `chatId` is a string of at most 200; `action` is `on` or `off`.
3. **The emoji is one character as a person sees it**: one emoji however many code points build it (a
   skin tone, pictographs joined by zero-width joiners, a flag, a keycap), or one precomposed letter with
   at most two combining marks; at most 16 UTF-16 code units. Joiners count only between pictographs, so
   letters joined into a word fail; invisible, direction, filler, surrogate and private-use characters
   fail, so a reaction can neither be blank nor turn the reaction row's direction. It is counted by hand (`isOneReactionCharacter`) because the app's
   JavaScript engine has no `Intl.Segmenter`. It is not held to the emoji DoU's own picker offers:
   that list belongs to the app's screens and changes with them, and a page reacting with another
   emoji harms no one.
4. **The message is checked before the write, through the cache.** The id names no room, so the shell
   reads the message from the device cache (`messageInCurrentPlace`) and checks its room exactly as a
   send's room: one the device holds, in the cloud and the place the view opened on, with the session
   still there. A message the user's own screen offers no reaction on — deleted, still sending, failed,
   or a row that records an edit or a reaction — is refused too. A message the cache does not hold is
   refused (`guard`): a write cannot be checked after
   it is made, unlike a read, whose answer can be. Parsing the room out of the id was rejected — the id's
   format is the server's, and the cache is what says the user can see the message.
5. **`off` is allowed, and it removes the user's reaction whoever set it.** The server keeps one reaction
   per user and emoji, with nothing saying a page set it. Allowing only `on` would leave a poll unable to
   take a vote back. The consent question says so: the page adds and removes reactions, the user's own
   included.
6. **A budget of its own**, one per 250 ms and 60 a minute per view, apart from the reads and the sends:
   twice the send rate, since a reaction adds no row to anyone's room. It is spent before the message is
   read, so a refused attempt counts and a page cannot probe which message ids the cache holds.
7. **Consent per place, as a send's.** The question names reacting in its title and text; a yes is kept
   per user, page, cloud and place with the permissions it covered, so a yes given before a page asked
   for `chatReact` does not cover it.
8. **The type test pins the two writes by name.** Allowed names that look like writes are exactly
   `chat.sendChat` and `chat.setReaction`; the one `send` cost is the first and the one `react` cost the
   second. A third write fails to compile until it is argued for.

## Alternatives

- **Open reactions under `chatSend`.** One permission for "acts in my name". Rejected: a page that only
  counts votes would have to ask to post messages too, and the user would be asked for more than it
  does.
- **Hold the emoji to the app's list.** Narrower, but it ties the protocol to a screen's picker and
  breaks a page whenever the picker changes.
- **`on` only.** Safer for the user's own reactions, but a vote could never be taken back, and a page
  could still flood a message with many emoji.
- **Mark a reaction as the page's.** The message model has no field for it; it needs the server first,
  as for the text send.

## Consequences

- A page with `chatReact` can remove a reaction the user added by hand. The consent says so; nothing
  else can tell them apart.
- A message the device has not cached cannot be reacted to, even in the opened place. A page reacts to
  messages it has read, which puts them in the cache anyway.
- The SDK's typed methods do not have `chat.setReaction` yet; a page calls it untyped until the SDK's
  own change adds it. The app's contract test holds `chatReact` out of the typed comparison until then,
  by name.
- An app release is needed before any user sees it.
