# The runtime across the bridge

On the phone the session can belong to the shell's own JavaScript process instead of the page: the
shell runs this package's runtime — the session and its tokens, the sockets, sync, the repositories —
and the page mirrors it, asking the shell for everything the session decides. This document is the
contract the two halves share, and both halves of it: the shell's (`RuntimeBridgeHost`) and the page's
mirror engine (`createMirrorEngine`). The web app's entry point says hello and picks it — through
runtime-web's `settleSessionOwner` — on a launch whose shell offers.

## Where the cut is

| In the owner's process                                                     | In the page                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| the session and its tokens, transports, authentication, sync, repositories | screens, routing, React hooks, react-query's memory cache, UI state |

What crosses is domain-shaped: a repository call and its result, a subscription's events, the session
snapshot, a session command. Never a socket frame, an HTTP request or a token. Cutting lower (only the
transports in the shell) would put the token refresh in one process and the session writes in the
other; cutting per screen would put two sessions on one device.

## Who owns the session this launch

Settled once, when the page boots, and never changed while the app runs. The page owns it unless both
sides agree otherwise:

```text
shell, before the page runs     window.CHATIC_APP_RUNTIME = { sessionOwner: 'native', contracts: [1] }
page, before it boots           readRuntimeOffer(window.CHATIC_APP_RUNTIME)  → an offer it can speak?
                                  no  → boot its own runtime (as every launch did before)
                                  yes → RuntimeHello { contracts }  and wait
shell                           answerRuntimeHello(request, host)
                                  → native: the newest shared contract, seq, the session now
                                  → web:    it does not run its runtime this launch, or shares no contract
page                            settleRuntimeHello(outcome) → web · native · not settled (ask again)
```

- **The shell offers, the page asks, the shell decides.** A page that has no offer, or whose own
  setting says not to, never asks — so one web deploy that stops asking returns every launch to the
  page owning the session.
- **The page runs its own runtime only when it knows the shell does not.** That is a `web` answer, or
  `NOT_FOUND` — a shell with no hello handler has no runtime to own the session with.
- **Anything else settles nothing, and the page asks again.** A timeout, another bridge failure, an
  answer that does not read, a contract the page never offered: the shell may already have taken the
  session when its answer was lost, and a page that booted its own runtime then would be a second
  owner — or one that finds no session, which the shell keeps from it. Asking again is safe because
  **the shell answers every hello of a launch with the same owner**: once it has said `native`, it
  says `native` until the app process ends. What a page does when asking again keeps failing is the
  page's to decide; booting its own runtime is not an option. The web page asks for 30 s of being
  shown, then shows an error with a reload instead of booting at all (runtime-web's
  `settleSessionOwner`); a `RUNTIME_CONTRACT_MISMATCH` refusal ends the asking at once.
- **The injected offer is read as untrusted.** A value that is not an offer, or names none of the
  page's contracts, is no offer at all; it never throws at boot.
- **A reloaded page says hello again** and is answered from the runtime that is already running. The
  connections do not drop with the page.

The shell's runtime keeps the session in the same vault item, under the same keys, as the page does
when it owns the session. A launch of either kind reads the same session, so moving a device between
the two needs no migration and signs nobody out. Only the owner writes; while the shell owns the
session it does not hand the session's keys to the page.

## The contract version

`RUNTIME_CONTRACT_VERSION` is one number for everything the two halves must read alike: the session
snapshot's fields, the methods a call may name with their arguments and results, the events of each
subscription. It goes up when any of that changes in a way the other side cannot read (a field
removed or renamed, a method's arguments reshaped). Adding a method or an optional field does not
raise it.

The halves ship separately — the page with each web deploy, the shell's runtime with an app release —
and a page newer than the installed app is the normal case. So each side lists every version it can
still speak (`RUNTIME_CONTRACTS`), and the handshake takes the newest they share
(`chooseRuntimeContract`).

The session snapshot is in the contract: `SessionSnapshot`
([docs/session](../session/README.md#the-session-view)) is what the shell's runtime puts in
`OnRuntimeHello` and `OnRuntimeSessionChanged` (`SessionSnapshotWire`). The bridge vocabulary declares
those bodies as plain JSON; runtime-core is where the shape is typed.

So are the session commands. A `RuntimeCall` names them with the target `session`
(`SESSION_COMMANDS_TARGET`) and one of `SESSION_COMMAND_METHODS` — the allow-list the shell dispatches
against, keyed by every member of `SessionCommands`, so a command added there and left out of the list
does not compile. The arguments are the command's own, in order; the result is what it resolves with
([docs/session](../session/README.md#the-commands)).

The sockets and the sync engine are two more targets, `connection` (`CONNECTION_TARGET`) and `sync`
(`SYNC_TARGET`). Each member says how it crosses, keyed by every member of `RuntimeConnection` and
`RuntimeSync` so a new one cannot be left out: a **view** is mirrored with its snapshot (the connection's
`snapshot` and `subscribe`; the sync's refused rooms, `refusedChannels` with `isChannelRefused` and
`subscribeRefusedChannels`) — subscribed to as a stream named in `VIEW_STREAMS` (`connection.snapshot`,
`sync.refusedChannels`), whose events carry the view's whole value, once at subscribing and then after
each change, coalesced per turn; a **call** is one `RuntimeCall` (`CONNECTION_CALL_METHODS`,
`SYNC_CALL_METHODS`); a **stream** is a `RuntimeSubscribe` whose events the page hears until it
unsubscribes (`CONNECTION_STREAMS` — a server push type, every frame, request samples; `SYNC_STREAMS` —
a target registration, which stands while its stream is open); a **local** member does not cross at
all (`CONNECTION_LOCAL_MEMBERS`). What crosses is a domain result — a socket request of any type and
every raw frame are not, so `requestOnSlot` and `onServerMessage` are local: they work only where the
runtime runs in the page's own process. The page does not use the request — the relay account's
profile is the session commands `fetchAccountProfile` / `updateAccountProfile` — and the frames feed a
desktop debug log, where the desktop shell never runs the runtime itself
([docs/connection](../connection/README.md#the-sockets-as-screens-read-them)).

The data is a fourth target, `data` (`DATA_TARGET`). A repository method is named
`<repository>.<method>` — `chat.sendChat`. For a cloud's graph rather than the live scope's the target
is `data@cloud` (`DATA_CLOUD_TARGET`), with the same names and the cloud id first among the arguments.
`REPOSITORY_METHODS` lists every method of the page's graph, keyed by every method of each page
repository so a new one cannot be left out, and each crossing is read off the method's signature, so an
entry that disagrees with its method does not compile: a method that returns a promise is a `call`; one
whose promise resolves with a write receipt a `receipt` ([below](#write-receipts)); an `observe*` method,
which returns its unsubscribe, a `stream` whose events are its callback's arguments; a method that
returns nothing a `send` — a call its caller does not wait for (`device.syncDevice`,
`device.syncStatus`); and a method that answers synchronously with a value is `local`, since the page has
no answer to give in the same turn (none does today: the chat's answered ranges, which a room once read
that way, are the stream `chat.observeFeedCoverage`) (`REPOSITORY_CALL_METHODS` holds the calls, the sends
and — for a page from before they streamed — the receipts; `REPOSITORY_STREAMS` the streams;
`REPOSITORY_RECEIPTS` the receipts). The
token issuers are not on the page's graph, so they are not in the contract either (`confirmPhoneCode`
stays, for `link` mode only). The rest of `RuntimeData` is listed the same way (`DATA_CALL_METHODS`,
`DATA_STREAMS`) ([docs/data](../data/README.md#the-pages-graph)). `primeChatRoom` is a sync call; its
`cancelled` option is asked only in the process that runs the prime — across the bridge the page drops a
late outcome instead. `registerDeviceToken` is a data call, for the debug screen that re-registers a
push token by hand. `holdCloud` is a data stream with no listener and no events: the cloud's socket is
held while the page's subscription stands — the image send's hold across the upload it makes itself —
and released when the page unsubscribes, or says hello again after a reload. Three things follow from
the page's `holdCloud` returning its release at once while the subscription crosses on its own:

- **The subscribe has to reach the shell before the send's first call.** The page sends it first and
  the bridge delivers in order; a mirror that queued subscriptions behind calls would let the first
  request go out unheld.
- **A hold the shell refuses cannot fail the send.** An app older than the member answers
  `RUNTIME_NOT_AVAILABLE`, and nothing is there to throw to — the release has already been handed
  over. The send goes on unheld, which only reopens the window a cloud switch could hit; the mirror
  is to log the refusal.
- **Nothing bounds a hold but its subscription.** In the page's own process the release runs when the
  send settles. Across the bridge it runs when the page's unsubscribe arrives, a new hello ends the
  last document's subscriptions, or the host is disposed — a page that never sends its unsubscribe
  keeps the cloud held, outside the socket cap, until one of the other two.

The session commands gained the relay account's profile (`fetchAccountProfile`,
`updateAccountProfile`) — what pages used to send on the relay slot themselves.

### What a result may hold

A result crosses as JSON, so a part of it that JSON cannot carry does not arrive as itself: a function
is dropped, and a promise, a `Map` or a `Set` arrives as `{}`. The page then holds an object its type
says is something else, and the screen that reads it breaks only on a launch whose shell owns the
session — the in-process engine hands over the real thing. So every result the contract lets cross is
checked by the compiler: `NotOnTheWire` (`src/bridge/wire.ts`) names each part of a type JSON cannot
carry, and `CheckedCrossing` takes `call` away from a member whose result has one. A table entry that
lists such a member as a call — a session command, a connection or sync call, a data call, a repository
method — does not compile, and the message names the part (`result does not cross the bridge —
delivered: a promise`). A `Date` is not flagged: it arrives as its ISO string, which is what the
contract promises a page. The arguments are not checked this way: the two that take a function
(`primeChatRoom`'s `cancelled`, `chat.refreshList`'s `onFetched`) are asked only where the runtime
runs, and the page does not pass the second.

The test loopback (`src/testing/mirrorLoopback.ts`) carries every request, answer and push through
JSON for the same reason: before it did, a test handed the page the shell's own objects, and a result
holding a promise passed every test while the screen built on it failed.

### Write receipts

`join.readChat` and `join.updateJoin` are local-first writes ([`@chatic/data`'s
outbox](../../../data/docs/outbox/README.md)): each resolves once the write is made locally, with a
receipt whose `delivered` promise settles when the server has it — or rejects with the refusal. Screens
read both halves: a nick or a notification change closes its dialog on the first and shows the second's
refusal; a read cursor waits for the server's half. The second is a promise inside a result, which a
call cannot carry, so such a method crosses as a stream instead (`receipt`):

| Event                 | Means                                                                                |
| --------------------- | ------------------------------------------------------------------------------------ |
| `{ written }`         | the method resolved: the write is made, `written` is the receipt without `delivered` |
| `{ delivered: true }` | the server has the write                                                             |
| `{ $ended: failure }` | the method threw (before `written`) or the server refused the write (after it)       |

- **The page subscribes under the method's own name** — `join.updateJoin` on `data` or `data@cloud` —
  with the method's arguments and no listener marker. The shell calls the method as the subscribe
  arrives, not on a later turn, so a call the page sends next finds the write started, as in-process.
- **The mirror answers the receipt's shape.** It resolves on `written` with `{ ...written, delivered }`,
  settles `delivered` on the next event, and unsubscribes then; the failures reject the call or
  `delivered` with the fields a screen reads, as a call's would. A refusal is not logged by the mirror —
  the screen hears it, as it does in-process — and `delivered` is handled at once, as the outbox's own
  is, so a refusal no one waits for is not an unhandled rejection.
- **The local half is bounded, the server's is not.** A `written` that has not arrived after
  `RECEIPT_WRITTEN_TIMEOUT_MS` (60 s — the bridge's timeout for a runtime call, which bounded these
  writes when they crossed as calls) rejects the call with the `408 REQUEST TIMEOUT - …` a timed-out
  call reads as. `delivered` waits as long as the outbox does: it stays pending while the cloud's socket
  is down.
- **Unsubscribing stops the events, not the write.** The write is the outbox's and goes out whether or
  not a page is still listening. A mirror disposed while a receipt waits leaves it unsettled; only a
  test disposes a mirror its page still uses.
- **An app from before receipts streamed** answers the subscribe `RUNTIME_NOT_AVAILABLE`. The mirror
  then calls the method as before and resolves `delivered` at once, without the server having it: the
  write is made and goes out as always, but a refusal of it is not heard on the page, and what waits on
  `delivered` — a read cursor, the bulk "mark read" — no longer waits for the server. The mirror
  remembers the refusal per method and calls it plainly from then on, logging it once. The shell still
  answers the method as a call too, for a page from before: the write is made, and that page gets the
  receipt JSON emptied, as it always did.
- **A lost subscribe answer** is the one case that misreads. Should the bridge time out the subscribe
  after `written` arrived, `delivered` rejects with that 408 though the write may still be delivered. The
  subscribe is answered at once, so this needs the answer itself to go missing.

Adding the stream raised no version: an older shell refuses it with `RUNTIME_NOT_AVAILABLE`, which the
mirror falls back on, and an older page never asks for it.

Version 1 includes how a call and a subscription are spelled across the bridge, not only what they
name: the `data@cloud` target, the listener marker (`{ $listener: true }`), the last event of an
ended stream (`{ $ended: failure }`), and a write receipt's stream — subscribed under the method's own
name with no marker, its events `{ written }` and `{ delivered: true }`. Once a build that answers them
ships, changing any of them is a change the other side cannot read, and raises the version.

## The messages

Bridge 2.23.0 carries the conversation in six messages, declared in `@chatic/bridge-messages` as
envelopes over plain JSON:

| Message                                                     | Direction     | Carries                                                     |
| ----------------------------------------------------------- | ------------- | ----------------------------------------------------------- |
| `RuntimeHello` → `OnRuntimeHello`                           | page → shell  | the page's contracts → the owner, the contract, the session |
| `RuntimeCall` → `OnRuntimeCall`                             | page → shell  | `target`, `method`, `args` → the method's result            |
| `RuntimeSubscribe` / `RuntimeUnsubscribe`, `OnRuntimeEvent` | page ↔ shell | a stream under the page's id; events numbered per stream    |
| `OnRuntimeSessionChanged`                                   | shell → page  | the change's kinds and the numbered snapshot                |

A method the contract gains needs no new message. The bridge vocabulary changes only if the
conversation itself does.

## A method the installed app does not have

Adding a method does not raise the contract version, so a page newer than the installed app can call
one the app's runtime predates. The shell answers that call with `RUNTIME_NOT_AVAILABLE`
(`runtimeNotAvailableFailure`), never with `RUNTIME_ERROR`, so the page can tell "not in this app
yet" from a call that ran and failed — and fall back, as it does for a bridge message an older shell
answers with `NOT_FOUND`.

`chat.listRoomMedia` and `chat.countRoomMedia` are the first methods added this way: pass-throughs to
the chat cache's room media index that the room's file list reads. Where the shell owns the session,
an app built before them answers `RUNTIME_NOT_AVAILABLE`, and the page reads that as "this app has no
room file list yet" — it hides the entry point rather than showing an empty list. Where the page runs
its own runtime (a browser, an app that does not own the session) the web deploy alone brings them.

## Errors

Screens do not branch on error classes; they read fields off what was thrown. A call whose method
throws answers `success: false` with code `RUNTIME_ERROR` (`toRuntimeFailure`), and its details carry
exactly those fields:

| Field                                       | Read by                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `message`                                   | the leading status a socket rejection writes (`408 REQUEST TIMEOUT - …`) |
| `errorCode`                                 | the status a socket rejection carries                                    |
| `status` · `statusCode` · `response.status` | HTTP status checks                                                       |
| `code`                                      | axios's `ERR_NETWORK` and similar                                        |
| `response.data`                             | the server's error body                                                  |
| `name`                                      | kept as it was                                                           |

The page throws an `Error` carrying the same fields (`reviveRuntimeError`), so a screen's checks give
the same answer whichever process ran the call. It reads what crossed through the same allow-list it
was written with, so nothing else lands on the page's `Error` — not a stack, a prototype or a status of
the wrong type. A body that is not plain JSON is dropped rather than failing the reply, and
serializing never throws, whatever was thrown.

A failure that is the bridge's own becomes an `Error` with that code. The bridge's `TIMEOUT` reads as
the socket client's timeout does — `408 REQUEST TIMEOUT - …` — so a screen that treats a 408 as "no
answer" reads a call the bridge gave up on the same way as one the socket gave up on.

The field list is what the page's screens read. Markers the owner's own recovery reads, such as the
stale-credential route `@chatic/http` stamps on a failed request, do not cross: that recovery runs
where the session is, before the error reaches the page.

## The shell's half: `RuntimeBridgeHost`

`createRuntimeBridgeHost({ engine, send })` (`src/bridge/host.ts`) answers the four requests for any
shell. The shell supplies the engine — started on first ask, `null` when it does not run the session —
and how to push; it wires the requests to `hello`, `call`, `subscribe` and `unsubscribe`, each of
which answers `{ value }` or `{ failure }` rather than throwing.

- **Hello.** Waits for the engine for at most `helloWaitMs` (5 s); one still starting answers
  `RUNTIME_STARTING`, which `settleRuntimeHello` reads as no answer, so the page asks again. Otherwise
  `answerRuntimeHello` decides. Once a hello is answered `native` the host keeps that engine, and a
  later page is never told `web`: one that shares no contract with the shell is answered
  `RUNTIME_CONTRACT_MISMATCH` — it cannot mirror this app, and must not take the session the app runs.
  Every hello is a new document, so the subscriptions of the last one end.
- **Calls** run only what the contract lists for their target; anything else — `requestOnSlot`, a name
  that is not a member, a repository's `constructor` — answers `RUNTIME_NOT_AVAILABLE`, and nothing
  outside the lists is reachable however it is spelled. Before a hello was answered `native` every call
  answers `RUNTIME_NOT_STARTED`.
- **Subscriptions.** A page puts `RUNTIME_LISTENER_MARKER` (`{ $listener: true }`) in `args` where the
  member takes its listener — an `observe*` callback, `onServerEvent`'s listener, an observer — and the
  host puts its own there. Each call of it is one `OnRuntimeEvent` whose `event` is the listener's
  arguments as an array, numbered per subscription id — on across a replacement under the same id, and
  from 1 again after a hello: a reloaded page's mirror reuses the last page's ids, and numbers carried
  over would read to it as skipped events. Starting over is safe because the hello ends every stream of
  the last document before it is answered, and the shell sends events unbuffered and in order with the
  answers — whatever an old stream sent reaches the page ahead of the hello's answer, before the new
  document has subscribed. A shell that buffered events per document would break that, and would have
  to number across documents again. A listener stream takes exactly one marker, and `registerTarget` and `data.holdCloud`, which take none,
  stand while subscribed; a stream with the wrong count, or one that answers no way to stop it, is
  refused. A write receipt's stream takes no marker from the page either: the host puts its own
  listener in ([Write receipts](#write-receipts)). A new subscription under a known id replaces the old
  one.
- **The session.** Each change of the session view, coalesced to one per JS turn, is pushed as
  `OnRuntimeSessionChanged` with the next number; the hello's answer carries the number it is at, so
  the page drops any push older than what it holds. Its `signals` say what happened since the last one:
  `session` (`SESSION_CHANGE_SIGNAL`) for a change of the view, and `logout` (`SESSION_LOGOUT_SIGNAL`)
  for a sign-out — `SessionView.onLogout`, which a snapshot cannot carry because the session after it
  may look the same. A sign-out and the change it brought travel in one push. A push still waiting when
  a call settles is sent before the call's answer, so a command the page awaits resolves with its
  effect already in the page's snapshot.
- **Views** (`VIEW_STREAMS`) are served as streams the host feeds itself, with no listener marker. A
  view whose read throws ends with `{ $ended: failure }`.
- **Events can come before the subscribe's answer.** A view's first value, and any event a member
  emits while it is being subscribed, is sent in the same turn, ahead of the `OnRuntimeSubscribe`
  reply. The page keeps the events of a subscription it is still waiting on, keyed by its own id —
  it must not drop an event for an id it has not seen answered. The mirror routes events by the id it
  chose before it asked, so it never does.
- **Size.** Every body's size — the length of its JSON, an approximation of what crosses — goes to
  `onPayload`. A result over `payloadLimit` (4 Mi characters) answers `RUNTIME_PAYLOAD_TOO_LARGE`; an
  event over it ends its subscription with a last event `{ $ended: failure }`. A hello's answer and a
  session push are measured, never refused. The cap is a safety net, not chunking: the cache's bridge messages already
  carry bodies of the same size unsplit, and splitting waits for measurements that show it is needed.

## The page's half: the mirror engine

`createMirrorEngine({ port, hello })` (`src/bridge/mirror/`) is the engine of a page that mirrors a
runtime running elsewhere. It has every member the in-process engine has — a test holds the two side by
side — so the React surface cannot tell which it was given. The port (`RuntimeMirrorPort`) is the three
requests and the two pushes; `@chatic/runtime-web`'s `createBridgedRuntime` is it over the page's
bridge, and a test joins it to a host in the same process, through JSON as the bridge does
(`src/testing/mirrorLoopback.ts`). The
port must deliver in order: the mirror relies on a session push sent before an answer arriving before
it.

- **The session** starts from the hello's snapshot and takes each push in number order; one at or below
  the number held is dropped. Each part of a pushed snapshot that equals the part held keeps its object
  (`shareStructure`), so a reader of one part does not re-render for a change in another, and a push
  that changed nothing notifies no one. A `logout` signal runs the `onLogout` listeners once the new
  snapshot is in place, each guarded.
- **Commands** are one call each. Because the shell pushes before it answers, a command resolves with
  its effect already in the snapshot — the order a screen that awaits a sign-in and reads the session
  next relies on.
- **Views** — the connection's snapshot, the refused rooms — are streams opened when the engine is made
  and read synchronously. Until the first value arrives the connection reads idle with nothing
  verified, and no room is refused.
- **Calls** answer with the member's result or throw `reviveRuntimeError`'s error. A trailing
  `undefined` argument is dropped, so the member applies its own default; one in the middle crosses as
  `null`. A result crosses as it was, `null` included; a member that resolved `undefined` arrives as
  `null`. A `void` member (`setBackgroundClouds`, `setOwnedClouds`, `updateLocalSnapshot`, a repository's
  `send` methods) is sent without waiting, and its failure logged. A wait that never rejects in-process
  (`waitUntilVerified`, `waitForCloudSocket`) answers `false` when the bridge fails.
- **Streams** — an `observe*` method, `onServerEvent`, a target registration, a cloud hold
  (`holdCloud`, which keeps a cloud's socket for a media send while open) — are routed by the id the
  mirror chose before asking, so an event ahead of the subscribe's
  answer is kept. A late copy (a number at or below the last) is dropped; a gap is logged. `{ $ended }`
  or a refused subscribe ends the stream and is logged — the screen that opened it has no other way to
  hear it. Stopping is synchronous; the unsubscribe goes out once the subscribe was answered, so the
  shell never receives them in the wrong order.
- **Repositories** are plain objects built from `REPOSITORY_METHODS`: a call per method, an `observe*`
  method as a stream whose listener is its function argument, and a write receipt's method as its
  receipt stream ([Write receipts](#write-receipts)). `cloudRepositories(cid)` is the same against
  `data@cloud`, one graph per cloud id.
- **Local members** (`requestOnSlot`, `onServerMessage`, a repository's `local` methods) throw
  `RUNTIME_NOT_AVAILABLE`.
- **Lifecycle members do nothing.** The session and connection controllers, the two credential guards
  and push registration run where the runtime runs; the session controller only reports ready once the
  mirrored session is initialised.
- **Promises keep their in-process shape.** `primeChatRoom` never throws (a failure is `failed`) and asks
  its `cancelled` option when the outcome arrives, since a function does not cross; `prefetchRoomFeed`
  never rejects.
- **A room's trace.** The `chat_room_sync` trace is in the page, while the prime and the first fetch run
  in the shell. So the mirror marks it around the calls (`roomTrace.ts`): `verified` as the prime is
  asked; `feed_sent` as the first fetch for the room is asked (`fetchRoomFeed`, or `prefetchRoomFeed` —
  only while the mirrored snapshot has the cloud's socket verified, as the in-process prefetch starts
  nothing otherwise — which resolves with its result for this), then the counts and `feed_done`, ending
  the trace when nothing was written, or as `error` when the fetch failed or answered `null`.
  `feed_received` and the `cache` attribute only the shell sees, so they are absent, as are the marks of
  a fetch the prime itself starts. Each trace it touches carries `session_owner: native`, an attribute
  the log pipeline records and Firebase does not, so the two ways of running are compared apart.

What crosses is JSON: a result that held a `Date` arrives as its ISO string, and a result that would
hold anything JSON cannot carry does not compile ([What a result may hold](#what-a-result-may-hold)).

## A sub WebView page: a whitelist of reads

A mini app in the phone's sub WebView may speak the same four requests to its own host, through a
whitelist kept here (`subWebViewWhitelist.ts`). It is a whitelist of **requests**, not a filter on
data: an allowed method answers a page exactly what it answers the main web, the whole row. What makes
that safe is which methods can be reached at all, and two rules decide every one:

- **Read only, in what it does.** Nothing that writes on the server or in the device cache, nothing
  that moves a sync cursor or a read cursor, and nothing the server may answer by creating something
  (`profile.get-mine` creates a missing profile row; `channel.get-self` creates the self chat). A read
  that writes what it fetched — every `refresh*`, `chat.getChat`, `user.getMyProfile`,
  `syncChannelUsers`, `syncProfilesOf`, and the room media reads that fill a room's media index — is a
  write here, not a read: the page's arguments decide where its rows land
  (`channel.refreshList({ sid })` with another place's id files this place's rooms under it), and a
  later sync does not undo it. So the server reads open to a page are the two that write nothing
  whatever their arguments, `channel.fetchList` and `place.isPlaceDeleted`, and under guards (below)
  the member list and `cloud.getCloud`, which writes nothing once the page passes `{ cache: false }`.

    One write is the exception, and it is written down as one: `chat.sendChat`, under a permission no
    read carries (`chatSend`), of plain text to a room of the place the view opened on — a line the user
    could have typed into that room. A page that runs a game in a room needs its own player to call
    into the room and the page to announce the result; nothing else a message can carry is open.

- **The current cloud, and no switching.** Only `data` is open, which is the live scope. `session` is
  closed — the cloud and place switches are session commands — and so are `connection`, `sync`,
  `data@cloud`, and every method that reaches another cloud (`*InCloud`, the cloud list and catalog,
  `searchCache` and `resolveCacheContext` with their cloud ids).

Arguments pass through as the main web sends them, except where an entry guards one
(`SubWebViewArgGuard`): `cloud.observeItem` and `cloud.cacheRead` pass only for the current cloud's id;
`cloud.getCloud` passes only as `({ id }, { cache: false })` with `id` the current cloud's and no
`cid` — it is how a page reads the cloud it is in, since an owned cloud's cache row often does not
exist (the app names owned clouds from the relay catalog, which is never written into the cache) and
the row holds only a name when it does;
`user.listPlaceMembers`, which loads the members' place profiles into the cache, passes only with
`placeId` and `sessionPlaceId` both the place the session is on (`SubWebViewRuntimeScope.placeId`, the
committed place — the one the server answers profiles for) and no `pageSize`, so one call stays the
server's page size. `chat.sendChat` passes only one argument (`argCount`), a plain object holding `channelId` and
`content` and nothing else (`onlyFields`), each a string with something besides white space in it, the content at
most `SUB_WEB_VIEW_MESSAGE_LIMIT` (1,000) long (`text`) — no attachments, mention, reply, content type,
system or webhook row. Its room has to be one of the place the view opened on, with the session still there, which only the
shell and the device cache can say: the entry carries `roomInCurrentPlace`, and the shell reads the room
before the message goes. Table lookups read only a table's own keys: a page names them, and `__proto__`
names nothing.

Each allowed method sits under one permission a page's manifest declares (`session`, `cloud`, `place`,
`channel`, `chat`, `user`, `chatSend`) with its cost — `local` for the device cache and its streams,
`server` for a read that asks the server, `send` for the message, each of the last two budgeted by the
shell on its own. Each closed one names its reason (`write`,
`cacheWrite`, `cursor`, `serverSideEffect`, `otherCloud`, `account`, `device`, `admin`, `internal`), and
whole repositories are closed with one: `auth`, `pairing`, `invite`, `subscription`, `device`, `report`,
`syncMeta`. The table is keyed by every repository and method of `REPOSITORY_METHODS` and every member
of `RuntimeData`, so **a method added to the runtime does not compile until it is decided here** — the
moment to ask the two questions above. The spec typecheck also refuses allowing a name that writes
(`create…`, `send…`, `read…`, `refresh…`, `sync…`, `cacheWrite…` and the like) other than
`chat.sendChat`, an entry budgeted as a send other than that one, anything `…InCloud`, a server read
other than the four above, and a stream that is not an `observe…`; and the test lists the
allowed methods by name, so a flipped entry shows as a diff.

`checkSubWebViewRuntimeRequest` answers, for one request, the page's granted permissions and where the
session is, whether it may go and at what cost — and for the message, which argument names the room
the shell must check — or the reason it may not; `subWebViewAllowedFor` lists what a set of
permissions opens, which the page's hello reports. The view's cloud, the user's consent, the message's
room and the budgets are the shell's to check around it (`apps/mobile` docs, the sub WebView).

## Where it lives

| File                                | Holds                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/bridge/contract.ts`            | `RUNTIME_CONTRACT_VERSION`, `RUNTIME_CONTRACTS`, `chooseRuntimeContract`, `readRuntimeOffer`, `answerRuntimeHello`, `settleRuntimeHello`, `SESSION_COMMANDS_TARGET`, `SESSION_COMMAND_METHODS`, `CONNECTION_TARGET`, `CONNECTION_CALL_METHODS`, `CONNECTION_STREAMS`, `CONNECTION_LOCAL_MEMBERS`, `SYNC_TARGET`, `SYNC_CALL_METHODS`, `SYNC_STREAMS` |
| `src/bridge/errors.ts`              | `RUNTIME_ERROR_CODE`, `RUNTIME_NOT_AVAILABLE_CODE`, `serializeRuntimeError`, `toRuntimeFailure`, `runtimeNotAvailableFailure`, `reviveRuntimeError`                                                                                                                                                                                                  |
| `src/bridge/host.ts`                | `createRuntimeBridgeHost`, `RUNTIME_LISTENER_MARKER`, `RUNTIME_STARTING_CODE`, `RUNTIME_CONTRACT_MISMATCH_CODE`, `RUNTIME_NOT_STARTED_CODE`, `RUNTIME_PAYLOAD_TOO_LARGE_CODE`, `RuntimeReceiptEvent`, the defaults                                                                                                                                   |
| `src/bridge/mirror/`                | `createMirrorEngine` (`mirrorEngine.ts`), `RuntimeMirrorPort` (`port.ts`), the calls, streams and write receipts (`conversation.ts`, `RECEIPT_WRITTEN_TIMEOUT_MS`), the session (`sessionMirror.ts`), `shareStructure`, the room trace (`roomTrace.ts`)                                                                                              |
| `src/bridge/repositories.ts`        | `DATA_TARGET`, `DATA_CLOUD_TARGET`, `REPOSITORY_METHODS`, `REPOSITORY_CALL_METHODS`, `REPOSITORY_STREAMS`, `REPOSITORY_RECEIPTS`, `DATA_CALL_METHODS`, `DATA_STREAMS`                                                                                                                                                                                |
| `src/bridge/subWebViewWhitelist.ts` | `SUB_WEB_VIEW_REPOSITORY_WHITELIST`, `SUB_WEB_VIEW_DATA_MEMBER_WHITELIST`, `SUB_WEB_VIEW_TARGETS`, `SUB_WEB_VIEW_ALLOWED`, `checkSubWebViewRuntimeRequest`, `subWebViewAllowedFor`                                                                                                                                                                   |
| `src/bridge/wire.ts`                | `NotOnTheWire`, `PromiseCrossing`, `CheckedCrossing` — what the compiler checks every crossing result against                                                                                                                                                                                                                                        |
