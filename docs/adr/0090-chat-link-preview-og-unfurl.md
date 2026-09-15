# ADR-0090: Chat link previews — og unfurl in the mobile shell, images loaded remotely

> Status: Accepted · Decided: 2026-07-31 · Implementation update: 2026-08-01 (decisions 2 and 9 — see the notes under each)
>
> What was built was described in `chat-link-preview.md`, in the root docs tree that has since been
> removed. This document is history, so the original decisions are not edited; notes were added only at
> the two places where the implementation diverged from them.

## Context

- The chat room in `apps/web` (`ChannelRoomPage`) has **no URL linkification at all.** A bubble renders
  content as a raw string (`ChannelMessageRow.tsx:214`, `MessageBubble.tsx:44`), and past 200 characters
  it truncates and shows the whole text in an expand dialog. A user cannot even tap a link in a chat.
  There is certainly no og preview.
- **Desktop already has all of this.** The Electron main process has `apps/desktop/src/main/unfurl.ts`
  (an SSRF guard, a 3-second timeout, a 256KB cap, og extraction), and the renderer has
  `apps/desktop-web/.../LinkPreviewCard.tsx` (a module-level cache) and `RichText.tsx` (linkification).
- **The bridge contract is already in the shared library.** `FetchUrlMetadata` /
  `OnFetchUrlMetadata` in `libs/app-messages/src/types/model/unfurl.ts` are registered in
  `WEB_MESSAGE_RESPONSE_TYPE` (`web-message-response.ts:43`). The only thing missing is **the mobile
  shell's handler implementation**.
- **The initial hypothesis was false.** It looked like "CORS stops the webview from showing an external
  og image, so native has to download and store it", but CORS does not apply to **loading** a subresource
  such as an `<img>`; it applies only when JS **reads the response body**. The two halves are exactly
  inverted — **showing an image works in the web, parsing HTML does not.** Desktop already running this
  structure (parsing in main, a remote `<img>` in the renderer) is the proof. `apps/web` has no CSP
  configured either.
- Constraint: the backend (`chatic-socials-api` / the socket server) is not touched this round.
- Constraint: the message wire schema is closed. `ChatSendRequestData` has no `attachments`, `meta` or
  `extra` — only `content` plus a free-string `contentType` — so preview data cannot travel with a
  message. Deriving it at render time is the only way.
- Constraint: RN 0.83's `fetch` is XHR-based and has no `response.body` streaming reader. **Copying
  desktop `unfurl.ts`'s `getReader()`-based 256KB cap verbatim would always read an empty body.**
- Constraint: the current cache stack (hot IndexedDB, cold native SQLite) is for domain records only.
  `CacheType` is a closed union and each type maps 1:1 to a SQLite table. There is no layer that holds
  binaries, and no service worker.

## Decision

1. **og parsing happens in the mobile shell.** Reuse the existing `FetchUrlMetadata` contract as it is —
   no new contract, so no `BRIDGE_VERSION` bump. Add the three registration points in
   `useWebMessageRouter` plus one domain hook.
2. **Implement it at the TS level, with no native module (Kotlin/Swift).** Cap the bytes with
   `onDownloadProgress` plus `AbortController` from `axios`, already a dependency. Port desktop's security
   guards rule for rule: http(s) only, private, loopback and link-local hosts blocked, **the redirect's
   final destination re-checked**, a 3-second timeout, an HTML content-type check, and og first with a
   `<title>` / `description` fallback.

    > **[Implementation update 2026-08-01] The transport changed from `axios` to a raw
    > `XMLHttpRequest`.** The substance of the decision ("TS level, no native module, every guard ported")
    > and the guard list are unchanged; only the layer that counts bytes was replaced.
    >
    > Why: **aborting with `axios` throws away the body received so far along with the request.** Any page
    > over 256KB (common for large news and commerce sites) would then produce no preview at all, even with
    > the og tags sitting intact in `<head>`. A raw XHR can snapshot `responseText` in `progress` before
    > aborting, which keeps the partial body, and as a bonus it can check `content-type` and `responseURL`
    > at `readyState === 2` and cut the request **before the body arrives**. Every guard decision 2 asked
    > for is still in place.
    >
    > The risk is asymmetric. If RN does not give incremental text during `progress`, the snapshot is an
    > empty string and the result is "no preview for a large page" — **exactly the axios behaviour this
    > decision already accepted**. There is an upper bound and no lower one. Confirmation on a real device
    > is still outstanding.
    >
    > Something else the implementation turned up: **RN's global `URL` is a stub with only `href` and
    > `toString()`, and does not expose `hostname`.** So the host guard could not rely on the standard
    > `URL`, and a regex splitter (`parseUrl`) was written instead. In the process `isPrivateHost` was
    > flipped to deny-by-default, which also blocks the alternative IP spellings the desktop version let
    > through (`http://2130706433/`, `http://0x7f000001/`) and single-label internal hosts
    > (`http://wiki/`).

3. **Images are not stored.** Only an https `imageUrl` rides in the response, and the web loads it
   directly with `<img src>` (the same as desktop). No binary crosses the bridge. `referrerPolicy="no-referrer"`
   is applied to ease hotlink blocking and reduce referrer leakage. http images are blocked as mixed
   content, so only https passes.
4. **The cache is session memory only.** As on desktop, a module-level `Map` (capped at 500, caching
   failures as `null`, deduplicating in-flight requests). No SQLite persistence.
5. **A preview card attaches to the first URL in a message, and only that one.** (The same as Slack and
   desktop.)
6. **Linkification is in scope, but for URLs only.** desktop-web `RichText`'s bold, italic,
   strikethrough and mention syntax is not ported. On tap, `isNative()` opens the external browser
   through `appBridge.openURL`, and otherwise a new window — the convention already established in
   `apps/web`.
7. **The URL to preview is found in the full text (`content`), and linkification applies to the string
   actually rendered.** A URL cut off at the 200-character boundary is not linkified (to prevent
   navigating to a wrong address). The same linkification applies to the full text in the expand dialog.
8. **In a plain browser, no preview card renders.** When `isNative()` is false it is quietly omitted —
   without the shell, parsing is impossible. Linkification still works in a browser.
9. **Share the logic, keep the UI per app.** The unfurl request and cache logic and the URL extraction
   regex move to a shared location, and each app has its own card component in its own design.
   `apps/desktop-web` uses `libs/web-ui-kit` nowhere and is an independent client, so the UI is not forced
   together.

    > **[Implementation update 2026-08-01] They did not move to a shared location. The unfurl request and
    > cache and the URL regex live inside `apps/web/features/channels`.**
    >
    > **The premise changed.** This decision assumed two web-side consumers, `apps/web` and
    > `apps/desktop-web`, but by the time work started **desktop (`apps/desktop`, `apps/desktop-web`) had
    > been excluded from scope**. Lifting code with a single consumer into `libs/shared` is not sharing but
    > indirection — one caller, and the definition further away.
    >
    > The cost of reversing was kept low. `tokenizeLinks` / `extractFirstUrl` are pure functions and
    > `requestUrlMetadata` is one function over one module-level `Map`, so when a second consumer appears
    > they move to `libs/shared` as they are. That is also when the same logic trapped inside
    > `apps/desktop-web`'s `LinkPreviewCard` gets tidied up.
    >
    > **Half the decision ("the UI stays per app") holds, but in a different place.** The purely
    > presentational card is in `libs/web-ui-kit/composites/chat/LinkPreviewCard.tsx`, which is not sharing
    > but this repo's UI layering convention — `web-ui-kit` is for `apps/web`, and `MessageRow`,
    > `ReadReceipt` and `SystemNotice` all live there. The data, the bridge and the platform branch belong
    > to `apps/web`'s `MessageLinkPreview`.
    >
    > **"Unifying the implementation with desktop's `unfurl.ts`", listed under "Out of scope (follow-up)"
    > below, is not follow-up work but irrelevant now.** The mobile shell's og fetcher borrows desktop
    > `unfurl.ts`'s guard rules and shares none of its code — it is a separate implementation.

**In scope:** the mobile shell's `FetchUrlMetadata` handler (the og fetcher plus the SSRF guard plus the
byte cap), URL linkification in `apps/web`, the preview card component, moving the unfurl request and
cache logic to a shared location, and opening the external browser on a link tap.

**Out of scope (follow-up):** a backend unfurl endpoint, a persistent og meta cache, an image proxy, image
messages (attachments) in general, `RichText`'s markdown formatting, and unifying the implementation with
desktop's `unfurl.ts`.

## Alternatives

- **A backend unfurl endpoint** — held. If the server fetched once and shared the cached result, web,
  mobile and desktop would converge on one path, and per-user duplicate fetches and IP exposure would both
  disappear. Technically the cleanest, but the backend is not being touched this cycle. It stays reachable
  by replacing the single `requestMetadata()` function from decision 4.
- **Native downloads the og image, stores it locally and serves it to the web** — dropped. It started from
  the CORS misunderstanding, and with that premise gone there is no benefit left. Doing it would need a new
  layer — `FileManagerBridge.downloadFile` plus a local static server (debug-only today) — when the
  webview's HTTP cache (`cacheEnabled` plus `LOAD_DEFAULT`) already fetches the image bytes.
- **Persist og meta in native SQLite** — dropped. It drags in the `CacheType` union, a new table, a
  migration and adapter wiring. Meanwhile preview requests happen only for messages actually rendered — a
  handful per app restart — and the cost of reversing is asymmetric (a memory cache is one function swap; a
  schema leaves a migration behind forever).
- **Squeeze it into the existing `meta` table** — dropped. `meta` is scoped `{cid, uid}`, so the same
  URL's metadata would be stored again for every cloud and user combination. An unfurl result is global
  data with no user, so the concepts do not match.
- **Parse it in a native module (Kotlin/Swift)** — dropped. It is an HTTP GET plus regex extraction, needs
  no OS API, and there is no reason to write and maintain two platform versions. `axios` is enough.
- **Port desktop-web's `RichText` wholesale** — held. Markdown formatting is a separate product decision
  and not something to slip in on the back of link previews.
- **Promote the preview card into a shared component** — dropped. desktop-web uses `web-ui-kit` not at all
  and is an independent client (see CONTEXT.md's definition of "Desktop Web"), and its layout requirements
  differ. Only the logic is shared.

## Consequences

- **What is gained:**
    - Chat links become tappable. That is worth more immediately than the preview.
    - With no new bridge contract there is no `BRIDGE_VERSION` bump and no skew management around it.
    - It is safe on an older shell. With no handler, `AppBridgeHost` returns `NOT_FOUND` and the card
      quietly does not render (a path Capability Skew already handles).
    - No schema change and no migration.
- **What is accepted:**
    - **The webview requests images from external domains directly, so the user's IP is exposed to those
      sites.** Spraying a malicious link into a channel can be used as a tracking pixel. It is the same
      risk desktop already accepts, and resolving it needs an image proxy (effectively a backend path).
    - Every channel member fetches the same link themselves. With no shared cache, a popular link is
      queried N times.
    - On an app restart, the links on screen are unfurled again.
    - A plain browser visit shows no previews.
    - **The byte cap is implemented twice, desktop (a streaming reader) and mobile (axios progress), and
      both have to be maintained.** The og extraction rules themselves can be shared; the transport layer
      cannot.
- **A known neighbouring defect (out of scope; take care if you touch it):** the resend path at
  `ChannelRoomPage.tsx:242` resends content without the `contentType`. desktop-web fixed the same bug with
  a shared `toSendPayload`. It becomes a problem the moment a `contentType` other than text reaches
  `apps/web`.
