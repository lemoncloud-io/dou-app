# The runtime across the bridge

On the phone the session can belong to the shell's own JavaScript process instead of the page: the
shell runs this package's runtime — the session and its tokens, the sockets, sync, the repositories —
and the page mirrors it, asking the shell for everything the session decides. This document is the
contract the two halves share, and both halves of it: the shell's (`RuntimeBridgeHost`) and the page's
mirror engine (`createMirrorEngine`). Nothing builds the mirror yet — the web entry that says hello and
picks it comes next.

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
  mirror's to decide; booting its own runtime is not an option.
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
entry that disagrees with its method does not compile: a method that returns a promise is a `call`; an
`observe*` method, which returns its unsubscribe, a `stream` whose events are its callback's arguments; a
method that returns nothing a `send` — a call its caller does not wait for (`device.syncDevice`,
`device.syncStatus`); and a method that answers synchronously with a value is `local`, since the page has
no answer to give in the same turn (none does today: the chat's answered ranges, which a room once read
that way, are the stream `chat.observeFeedCoverage`) (`REPOSITORY_CALL_METHODS` holds the calls and sends,
`REPOSITORY_STREAMS` the streams). The
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

Version 1 includes how a call and a subscription are spelled across the bridge, not only what they
name: the `data@cloud` target, the listener marker (`{ $listener: true }`) and the last event of an
ended stream (`{ $ended: failure }`). Once a build that answers them ships, changing any of them is a
change the other side cannot read, and raises the version.

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
  arguments as an array, numbered per subscription id — on across a replacement under the same id. A
  listener stream takes exactly one marker, and `registerTarget` and `data.holdCloud`, which take none,
  stand while subscribed; a stream with the wrong count, or one that answers no way to stop it, is
  refused. A new subscription under a known id replaces the old one.
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
bridge, and a test joins it to a host in the same process (`src/testing/mirrorLoopback.ts`). The
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
- **Repositories** are plain objects built from `REPOSITORY_METHODS`: a call per method, and an
  `observe*` method as a stream whose listener is its function argument. `cloudRepositories(cid)` is
  the same against `data@cloud`, one graph per cloud id.
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

What crosses is JSON: a result that held a `Date` arrives as its ISO string.

## Where it lives

| File                         | Holds                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/bridge/contract.ts`     | `RUNTIME_CONTRACT_VERSION`, `RUNTIME_CONTRACTS`, `chooseRuntimeContract`, `readRuntimeOffer`, `answerRuntimeHello`, `settleRuntimeHello`, `SESSION_COMMANDS_TARGET`, `SESSION_COMMAND_METHODS`, `CONNECTION_TARGET`, `CONNECTION_CALL_METHODS`, `CONNECTION_STREAMS`, `CONNECTION_LOCAL_MEMBERS`, `SYNC_TARGET`, `SYNC_CALL_METHODS`, `SYNC_STREAMS` |
| `src/bridge/errors.ts`       | `RUNTIME_ERROR_CODE`, `RUNTIME_NOT_AVAILABLE_CODE`, `serializeRuntimeError`, `toRuntimeFailure`, `runtimeNotAvailableFailure`, `reviveRuntimeError`                                                                                                                                                                                                  |
| `src/bridge/host.ts`         | `createRuntimeBridgeHost`, `RUNTIME_LISTENER_MARKER`, `RUNTIME_STARTING_CODE`, `RUNTIME_CONTRACT_MISMATCH_CODE`, `RUNTIME_NOT_STARTED_CODE`, `RUNTIME_PAYLOAD_TOO_LARGE_CODE`, the defaults                                                                                                                                                          |
| `src/bridge/mirror/`         | `createMirrorEngine` (`mirrorEngine.ts`), `RuntimeMirrorPort` (`port.ts`), the calls and streams (`conversation.ts`), the session (`sessionMirror.ts`), `shareStructure`, the room trace (`roomTrace.ts`)                                                                                                                                            |
| `src/bridge/repositories.ts` | `DATA_TARGET`, `DATA_CLOUD_TARGET`, `REPOSITORY_METHODS`, `REPOSITORY_CALL_METHODS`, `REPOSITORY_STREAMS`, `DATA_CALL_METHODS`, `DATA_STREAMS`                                                                                                                                                                                                       |
