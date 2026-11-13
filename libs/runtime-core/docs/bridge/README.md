# The runtime across the bridge

On the phone the session can belong to the shell's own JavaScript process instead of the page: the
shell runs this package's runtime — the session and its tokens, the sockets, sync, the repositories —
and the page mirrors it, asking the shell for everything the session decides. This document is the
contract the two halves share. The halves themselves (the shell's host, the page's mirror engine) are
not built yet; what exists is the contract both will be held to.

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
`snapshot` and `subscribe`); a **call** is one `RuntimeCall` (`CONNECTION_CALL_METHODS`,
`SYNC_CALL_METHODS`); a **stream** is a `RuntimeSubscribe` whose events the page hears until it
unsubscribes (`CONNECTION_STREAMS` — a server push type, every frame, request samples; `SYNC_STREAMS` —
a target registration, which stands while its stream is open); a **local** member does not cross at
all (`CONNECTION_LOCAL_MEMBERS`). What crosses is a domain result — a socket request of any type and
every raw frame are not, so `requestOnSlot` and `onServerMessage` are local: they work only where the
runtime runs in the page's own process. The relay account's profile reads and writes, the one use of
`requestOnSlot` in a page that may mirror a runtime, become domain calls before it does; the frames feed
a desktop debug log, and the desktop shell never runs the runtime itself
([docs/connection](../connection/README.md#the-sockets-as-screens-read-them)).

The repositories are added to the contract with the change that moves them behind the engine — where
the core engine is a first implementation to check it against.

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

## Where it lives

| File                     | Holds                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/bridge/contract.ts` | `RUNTIME_CONTRACT_VERSION`, `RUNTIME_CONTRACTS`, `chooseRuntimeContract`, `readRuntimeOffer`, `answerRuntimeHello`, `settleRuntimeHello`, `SESSION_COMMANDS_TARGET`, `SESSION_COMMAND_METHODS`, `CONNECTION_TARGET`, `CONNECTION_CALL_METHODS`, `CONNECTION_STREAMS`, `CONNECTION_LOCAL_MEMBERS`, `SYNC_TARGET`, `SYNC_CALL_METHODS`, `SYNC_STREAMS` |
| `src/bridge/errors.ts`   | `RUNTIME_ERROR_CODE`, `RUNTIME_NOT_AVAILABLE_CODE`, `serializeRuntimeError`, `toRuntimeFailure`, `runtimeNotAvailableFailure`, `reviveRuntimeError`                                                                                                                                                                                                  |
