# ADR-0320: A sub WebView page reads the current cloud through a whitelist of the runtime's requests

> Status: Accepted; decision 11 (the SDK's untyped `apps.runtime`) superseded in part by
> [ADR-0341](./0341-chatic-apps-sdk-types-a-pages-cloud-data-by-the-apps-own-names.md)
> · Decided: 2026-11-16 · Implemented: `feat/sub-webview-runtime-whitelist`
> · Scope: `libs/runtime-core/src/bridge/subWebViewWhitelist.ts` (the whitelist and its derived lists,
> re-exported by `libs/runtime-mobile`) · `libs/bridge-messages` (`model/sub-webview.ts` — the
> permissions, the hello's answer on the sub host, the error codes; `web-message.ts` — the subset;
> `model/runtime.ts` — who is answered) · `libs/bridges` (`BRIDGE_VERSION` 2.26.0) ·
> `apps/mobile/src/app/subWebView/` (`subWebViewRuntimeAccess.ts`, `subWebViewRuntimeGate.ts`,
> `subWebViewRuntimeBridge.ts`, `subWebViewRuntimeConsent.ts`, `subWebViewReadBudget.ts`) and
> `services/subWebView/subWebViewManifest.ts` · `libs/chatic-apps-sdk` (`apps.runtime`, the mock)
> · The specification is [apps/mobile docs/webview/sub-webview-protocol.md](../../apps/mobile/docs/webview/sub-webview-protocol.md#runtime-reads-2260);
> the whitelist's rules are in [libs/runtime-core docs/bridge](../../libs/runtime-core/docs/bridge/README.md#a-sub-webview-page-a-whitelist-of-reads)
> · Related: [ADR-0265](./0265-a-page-on-another-origin-opens-in-a-sub-webview-with-a-bridge-of-its-own.md),
> whose "nothing that identifies the user" this amends;
> [ADR-0278](./0278-a-sub-webview-page-declares-what-it-reaches-in-a-manifest-on-its-own-origin.md),
> whose manifest gains the permissions; [ADR-0297](./0297-sub-webview-opens-any-https-with-three-trust-tiers.md),
> whose `reviewed` tier is the only one answered;
> [ADR-0309](./0309-the-phone-shell-may-own-the-session-settled-per-launch.md), whose runtime messages
> and contract this reuses
>
> **Amended by [ADR-0323](./0323-a-sub-webview-page-reads-its-cloud-from-the-server-and-its-hello-waits-for-the-user.md) (2026-11-16):**
> decision 2's `cloud.getCloud` is open under `cloud` as `({ id }, { cache: false })`, which writes
> nothing, held to the current cloud with no `cid`; decision 4's server reads are four, and decision 5's
> table opens 29 methods; decision 11's `connect` waits for the user's answer with no timeout.
>
> **Amended by [ADR-0325](./0325-a-sub-webview-page-may-send-a-text-message-to-a-room-of-its-place.md) (2026-11-16):**
> decision 2 gains one write, `chat.sendChat` of plain text to a room of the place the view opened on,
> under a seventh permission, `chatSend` (decision 5), and decision 5's table opens 30 methods;
> decision 8 reads the room before a message goes; decision 9's question names sending, and its yes
> is kept per place; decision 10 budgets messages apart, at one per 500 ms and 30 a minute.

## Context

A mini app in the sub WebView knows only what its launch params say: the cloud and place ids and
names, and the user's id and name there. It cannot list the place's channels, read a room, or see who
is in the place, and it hears no change. The pages being built want exactly that — the cloud as the
user sees it in DoU, kept live.

Since ADR-0309 the phone shell can run the app's runtime itself. The main web then reaches it through
four messages that name a repository method (`channel.observeList`) rather than a socket frame, and
gets the method's own result or stream. The same four messages could serve a page, and the runtime's
contract already names every method, how it crosses, and its arguments.

What bounds it:

- The page is a third party's. It must not write anything or act for the user.
- It may read the cloud and places the user is in, but it must not switch the cloud or the place, nor
  read another cloud.
- The main WebView cannot relay for it. Measured on an Android 16 emulator, the main WebView under a
  sub view keeps running for about 60 seconds and then stops; replies from the shell to it are held
  until the view closes. So a page can be answered only where the shell runs the runtime itself.
- The desktop shell runs no runtime and answers a page's base requests only.

## Decision

1. **The bridge whitelists requests, not data.** The sub host registers the four runtime messages —
   `RuntimeHello`, `RuntimeCall`, `RuntimeSubscribe`, `RuntimeUnsubscribe` — with handlers written for
   it, and passes through only the methods the whitelist allows. An allowed method answers exactly
   what it answers the main web: no projection, no field filter. A page granted `channel` gets the
   whole channel row.

2. **Read only, in what it does.** A method is allowed only if it changes nothing: no server write,
   no device-cache write, no sync cursor and no read cursor. That closes the reads that write what they
   fetched into the cache — `refresh*`, `chat.getChat`, `cloud.getCloud`, `user.getMyProfile`,
   `user.syncChannelUsers`, `profile.syncProfilesOf` — and the room media reads (`chat.listRoomMedia`,
   `countRoomMedia`), whose first read fills the room's media index. A refresh looks like a read, but
   the page's arguments decide where its rows land: `channel.refreshList({ sid })` with another place's
   id files this place's rooms under that place, `channel.refreshOne` and `profile.syncProfilesOf` tag
   rows with the place the caller names, and `chat.refreshList` can mark cached messages hidden on the
   caller's options; none of it is undone by a later sync. A read the server may answer by creating
   something is closed too: `profile.getMyProfile` (`profile.get-mine` creates the row when there is
   none) and `channel.getSelfChannel` (`channel.get-self` creates the self chat). The server reads left
   are `channel.fetchList` and `place.isPlaceDeleted`, which write nothing, and `user.listPlaceMembers`
   (decision 3).

3. **The current cloud only, and no switching.** Only the `data` target is open, which is the live
   scope. Closed: `session`, where `switchCloud`, `switchSite` and `logout` are; `connection`; `sync`;
   `data@cloud`; and every method that reaches another cloud — `*InCloud`, the cloud list and catalog,
   `searchCache` and `resolveCacheContext` with their cloud ids. Arguments pass through as the main web
   sends them, except where an entry guards one: `cloud.observeItem` and `cloud.cacheRead` pass only
   when their id is the current cloud's; `user.listPlaceMembers`, which loads the members' place
   profiles into the cache, passes only for the place the session is really on (`placeId` and
   `sessionPlaceId` both its committed place — the place the server answers profiles for) and with no
   `pageSize` of the page's own, so one call stays the server's page size. The view is bound to the
   cloud selected when it opened: once the session's cloud is another, every open stream ends with
   `CLOUD_CHANGED` and every later request fails with it. The place is not bound. A page reads any
   place of the current cloud from the cache, and only the user moves between them.

4. **Every method is decided, with a reason.** The whitelist is a table keyed by every repository and
   method of the runtime contract and every other `data` member. Each entry either allows the method
   under a permission, with a cost (`local` for the device cache and its streams, `server` for a read
   that asks the server), or denies it with a reason: `write`, `cacheWrite`, `cursor`,
   `serverSideEffect`, `otherCloud`, `account`, `device`, `admin`, `internal`. Whole repositories are
   closed with one reason: `auth`, `pairing`, `invite`, `subscription` (`account`); `device`, `report`
   (`device`); `syncMeta` (`cursor`). A method added to the runtime does not compile until it has an
   entry. The whitelist's spec typecheck also refuses allowing a name that writes (`create…`, `send…`,
   `read…`, `refresh…`, `sync…`, `cacheWrite…` and the like), anything `…InCloud`, a server read other
   than the three above, and a stream that is not an `observe…`.

5. **Six permissions, declared in the manifest** beside `clipboard`, `share`, `openUrl` and `userKey`:

    | Permission | Opens                                                                                                                                                   |
    | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `session`  | the current cloud's part of the session in the hello's answer, and its change pushes (decision 7)                                                       |
    | `cloud`    | `cloud.observeItem`, `cacheRead` — the current cloud's row                                                                                              |
    | `place`    | `place.observeList`, `observeItem`, `cacheReadList`, `isPlaceDeleted`                                                                                   |
    | `channel`  | `channel.observeList`, `observeItem`, `cacheRead`, `cacheReadList`, `fetchList`; `join.observeList`, `cacheReadList`                                    |
    | `chat`     | `chat.observeList`, `observeLastList`, `observeFeedCoverage`, `cacheRead`, `cacheReadList`, `listPendingImageChats`                                     |
    | `user`     | `user.observeList`, `observeItem`, `cacheRead`, `cacheReadList`, `listPlaceMembers`; `profile.observeList`, `observeItem`, `cacheRead`, `cacheReadList` |

    28 methods in all. Everything else is closed.

6. **Registered only where it can be answered.** The four messages are on a page's host when all of
   these hold, and absent otherwise — missing from the handshake and answered `NOT_FOUND`, as in an
   app that predates them:
    - the phone, not the desktop;
    - the launch's session owner is settled as `native`;
    - the page is in the `reviewed` tier (an `external` site has no manifest; the hub needs none of
      this);
    - a cloud other than Home was selected when the view opened;
    - the manifest grants at least one of the six.

7. **The hello answers; it never settles the owner.** The main web settled that. The sub host's answer
   is `{ sessionOwner: 'native', contract, seq, session, allowed }`. `contract` is chosen from the
   page's list as the main web's is. `session` is, with `session` granted, the current cloud's part of
   the session under the snapshot's own paths — the cloud's id, place and readiness, the user's id in
   it, and the committed place — and `null` without. Not the whole snapshot: that is the account's,
   and holds the user's other clouds, the relay account and the device's guest id, which rule 3 keeps
   from a page. `allowed` lists the calls and streams this page may use, so it decides from that and
   not from failures.

8. **Each call and subscribe is checked in one order**, and the first failure answers:
    1. the request's own shape — and for a subscribe, room for one more stream — else `INVALID`;
    2. the view's cloud is still the session's, else `CLOUD_CHANGED`;
    3. the target is open, else `RUNTIME_NOT_ALLOWED`;
    4. the method has an allowing entry with this request's crossing, else `RUNTIME_NOT_ALLOWED`;
    5. its permission is granted, else `RUNTIME_NOT_ALLOWED`;
    6. its argument guards hold, else `RUNTIME_NOT_ALLOWED`;
    7. the user has allowed this page in this cloud, else `CONSENT_REFUSED`;
    8. for a `server` read, the view's budget has room, else `RATE_LIMITED` with `retryAfterMs`.

    Then the request goes to the runtime unchanged and its answer comes back unchanged.
    `RUNTIME_NOT_ALLOWED` carries the target, the method and the reason: the deny reason,
    `notGranted`, `guard`, or `unknown` for a name the whitelist does not have or a method asked the
    wrong way (a call as a stream). A method the installed runtime lacks still answers
    `RUNTIME_NOT_AVAILABLE`, and a method's own errors pass through.

9. **Consent per user, origin and cloud.** The hello is the first request a page sends, and it is not
   answered until the user has been asked, once, whether this page may read what its permissions
   name, in this cloud — with a system alert. A yes is remembered, with the permissions it covered, so
   a page that later asks for more is asked again. A no is held for the view only, so the page cannot
   put the question up again and again, and the next open asks anew.

10. **Bounds.** A page load holds at most 16 streams, counting subscribes still waiting for consent;
    one more fails `INVALID`. Server reads are
    budgeted per view — not per load, so a reload does not reset it — at one per 250 ms and 60 a
    minute. Each page load gets a runtime bridge host of its own over the app's engine, so a page's
    stream ids cannot touch the main web's streams, and every stream of a load ends when the load does.

11. **The SDK exposes it as `apps.runtime`**: `connect`, `can`, `call`, `subscribe`, `session`,
    `onSessionChange` and `onCloudChanged`. Method names are strings and what crosses is typed
    `unknown`: the SDK has no dependencies, and copying the contract's domain types into it would be a
    second schema to keep. A page reads `allowed` for the names, and the contract for the shapes.
    `SDK_RUNTIME_CONTRACTS` is held equal to the runtime's by a test.

## Alternatives

- **Project each answer into a public shape of its own** (a channel as `{ id, name, memberCount }`, a
  member without contact fields). It was drafted first. Rejected: the boundary is which requests a
  page may send, not which fields it may see, and a projection is a second schema to keep beside the
  contract that every new field would have to cross twice.
- **One message per read** (`ListSubWebViewChannels`, `ListSubWebViewMembers`…). Rejected: every read
  would need a message, a handler and an SDK release, and the contract already names each method, its
  arguments and how it crosses.
- **Register the main web's own runtime handlers on the sub host.** Rejected: they assume the main web
  — they settle the owner in the hello and answer session commands — and the protocol holds that a
  page is answered only by handlers written for it.
- **Relay through the main web on a launch the page owns.** Rejected: the Android measurement above.
  The main WebView stops answering under the view.
- **Read through `data@cloud`, with the view's cloud.** Rejected: at open it is the same as the live
  scope, and the cloud check in step 8 covers a drift. Opening `data@cloud` would make the cloud an
  argument the page supplies.
- **Keep the refreshing reads, with a rule for each argument** (pin `sid` to the committed place,
  strip options, clamp page sizes). Rejected: every cache-writing read would need its own rules, kept
  in step with a repository's arguments as they change, and a rule missed is a page writing into the
  cache. Closing them keeps "read only" a property of what the methods do. The one kept with a guard
  is the member list, which nothing in the cache can stand in for.
- **Bind the place as well as the cloud.** Rejected: reading the cloud's places is allowed; only moving
  between them is not, and a page cannot move.
- **A scoped token, so the page's server calls DoU for the user.** Deferred, as in ADR-0297: no token
  scoped to a page and an origin exists yet.

## Consequences

- **This amends the protocol's invariant that nothing a page receives identifies the DoU user.** With
  these permissions a page gets the cloud's data as the app holds it: ids in that cloud, names,
  profiles, messages, member lists. The rows pass through as the runtime has them. Where a row carries
  a contact field (`UserView` declares `phone` and `email`), the page gets it whenever the server
  filled it. Whoever approves a page's `user` permission has to weigh that. Tokens, the device id and
  the device's guest id still never reach a page: the session a page gets is the current cloud's part
  only, and no allowed method answers with a credential.
- **A page reads what the cache holds.** With the refreshing reads closed, a page sees what the app has
  already synced — fresh while the user's own screens keep it so — plus the server's room list
  (`channel.fetchList`) and member list. It cannot pull a room's older messages the app never loaded.
- **The runtime contract becomes a public surface.** A third party's page now speaks it, so a contract
  version change reaches pages DoU does not ship. The hello negotiates it as for the main web: the
  runtime keeps answering the older versions it lists, and a page that speaks none of them gets
  `RUNTIME_CONTRACT_MISMATCH`.
- **Nobody sees it yet.** The phone's session owner is a development switch today, so this answers
  only on launches where it is turned on, until native ownership becomes the default.
- The desktop gets none of it. A later change could serve it from the desktop web's runtime, since the
  desktop window does not stop under a view.
- The comment in `model/runtime.ts` that says only the main web is answered, and the protocol's
  security invariants, change with the implementation. `BRIDGE_VERSION` goes to 2.26.0.
- **Who grants a page its permissions is not decided here.** The approval happens outside the app.
  The shell does as ADR-0278 says: it reads the manifest served from the page's reviewed origin and
  trusts what it finds there. Whatever process puts a permission in that manifest is the grant, and
  nothing in the app asks for or checks an approval of its own.
