# ADR-0309: The phone shell may own the session, settled once per launch

> Status: Accepted · Decided: 2026-11-11 · Implemented: `feat/runtime-bridge-contract` (the contract
> only — no shell offers yet); `refactor/session-reads-via-engine` (the session snapshot, read through
> the engine); `refactor/token-free-login` (the commands: a one-step phone login, invite logins behind
> handles, login answers without `Token`); `refactor/session-commands-via-engine` (the session commands,
> run through the engine and named in the contract; a pairing approval's session held like an invite
> login's); `refactor/connection-via-engine` (the sockets and the sync engine through the engine, their
> calls and streams named in the contract); `feat/runtime-mobile` (the native adapter: React Native's
> ports and `createNativeRuntime`; not booted yet); `refactor/repositories-via-engine` (the page's
> repository graph without the token issuers, every repository method named in the contract)
> · Scope: `libs/bridge-messages/src/types/model/runtime.ts` (`RuntimeHello`, `RuntimeCall`,
> `RuntimeSubscribe`, `RuntimeUnsubscribe`, `OnRuntimeEvent`, `OnRuntimeSessionChanged`);
> `libs/bridges/src/version.ts` (bridge 2.23.0) and the copies pinned in `libs/chatic-apps-sdk`
> (`client.ts`, `mock.ts`); `libs/bridges/src/app/AppBridgeHost.ts` (`RuntimeHello` is not taken as the
> web being ready); the phone and desktop shells' contract tests (the requests unanswered, the pushes
> not sent); `libs/runtime-core/src/bridge/` (`RUNTIME_CONTRACT_VERSION`, the handshake, errors across
> the bridge); `libs/runtime-mobile` (`@chatic/runtime-mobile`) and the two native modules it needs in
> `apps/mobile/package.json` (`@react-native-community/netinfo`, `react-native-get-random-values`)
> · The behaviour is documented in [libs/runtime-core docs/bridge](../../libs/runtime-core/docs/bridge/README.md)
> · Amends: [ADR-0308](./0308-the-react-surface-starts-its-work-from-an-engine.md) — its first Alternative:
> the session's state joins the engine one reader group at a time, the core engine first

## Context

In the phone app today the page owns the session. The shell keeps the tokens at rest in its vault
(ADR-0293), but the page reads them into its own memory, signs with them, opens the sockets, runs sync
and owns every cache write. Everything the session does stops when the WebView is suspended, reloads
or crashes, and a script in the page can read every token.

ADR-0301 to ADR-0308 split the runtime into a platform-neutral core and ports, so that the same core
can run in the shell's own JavaScript process. A throwaway probe in the app bundle (not committed)
showed it does: the core libraries and `@chatic/runtime-core`, assembled with ports the probe filled,
signed in as a guest, verified the relay socket, made socket requests and refreshed the relay token on
Hermes, with no web code.

What remains is to decide where to cut between the shell's process and the page, how a launch decides
which side owns the session, and what crosses between them.

## Decision

**On the phone, the shell may own the session. Which side owns it is settled once per launch, and the
page owns it unless both sides agree otherwise.**

1. **The cut is at the repositories and the session.** The session, its tokens, the transports,
   authentication, sync and the repositories run in the owner's process. The page keeps the screens,
   routing, React hooks, react-query's memory cache and UI-only state. What crosses is a repository
   call and its result, a subscription's events, the session snapshot and session commands — domain
   results, not socket frames or HTTP requests.
2. **The shell offers; the page accepts; the shell decides.**
    - A shell that can own the session says so before the page runs, in `window.CHATIC_APP_RUNTIME`
      (`{ sessionOwner: 'native', contracts }`), the way it already lists its storage media.
    - A page that finds an offer it can speak sends `RuntimeHello` with its own contract versions before
      it boots its runtime, and waits for the answer — as it already waits for the vault before boot.
      A page without an offer, or one whose own setting says not to, never asks and boots as it always
      has.
    - The shell answers `native` with the newest contract both speak and the session as it is now, or
      `web` when it will not run its runtime this launch or shares none of the page's contracts. It
      starts its runtime's session work only on that first hello, so a page that never asks leaves the
      launch exactly as before.
    - The page runs its own runtime only when it knows the shell does not: a `web` answer, or
      `NOT_FOUND` from a shell with no hello handler. Anything else — a timeout, another failure, an
      answer it cannot read — settles nothing, and the page asks again. The shell may have taken the
      session when its answer was lost; a page that booted its own runtime then would be a second
      owner.

    The owner does not change while the app runs: once the shell has answered `native`, every later
    hello gets the same answer, which is what makes asking again safe. A reloaded page says hello
    again and is answered from the runtime that is already running; the connections do not drop.

3. **The shell's runtime keeps the session in the same vault item, under the same keys, as the page
   does when it owns it.** A launch that the page owns and a launch the shell owns read the same
   session, so switching between them needs no migration and does not sign anyone out. Only the
   owner writes: while the shell owns the session, it does not hand the session's keys to the page.
4. **No token crosses.** The snapshot leaves tokens out, a command takes what a person typed or chose
   (a phone number, a code, a provider's result) and keeps the tokens it produces, and a call answers
   with what a screen needs.
5. **Four requests, two pushes.** The bridge vocabulary declares envelopes: `RuntimeHello`,
   `RuntimeCall` (`target`, `method`, JSON `args`), `RuntimeSubscribe` / `RuntimeUnsubscribe` with
   `OnRuntimeEvent`, and `OnRuntimeSessionChanged`, each numbered. Which targets, methods, events and
   snapshot fields exist is the runtime's contract, declared by `@chatic/runtime-core` and versioned by
   one number both sides negotiate in the handshake. A method added to the contract needs no new
   message and does not raise the version; a shell whose runtime predates it answers a call to it with
   `RUNTIME_NOT_AVAILABLE`, which the page reads as "not in this app yet" and falls back on.
6. **An error crosses as the fields screens read**, not as a class: the message (with its leading
   status), `name`, `code`, `errorCode`, `status`, `statusCode`, `response.status` and `response.data`.
   The page throws an `Error` carrying the same fields, read through the same allow-list, so a
   screen's checks give the same answer whichever process ran the call. The stack does not cross. The
   bridge's own timeout reads as the socket client's (`408 REQUEST TIMEOUT - …`).

The browser and the desktop shell are untouched: the page owns the session there, and the desktop
shell never offers.

## Alternatives

- **Cut at the transports** (the shell runs only the socket and HTTP managers). The token refresh would
  happen in the shell and the session writes in the page — two owners of one session — and every
  socket frame would cross the bridge. Rejected.
- **Cut per screen** (a native path for each feature that needs one). Two sessions and two sets of
  connections on one device: refreshing a token in one leaves the other holding an expired one.
  Rejected.
- **The shell decides alone, before the page runs.** The page chooses its storage synchronously at boot,
  so it would need the decision injected — and a page that cannot mirror the session (an older bundle,
  a bundle whose mirror is switched off) would be handed a session it cannot read. With the page
  asking, one web deploy that stops asking returns every launch to the page owning the session, which
  is the rollback until a remote setting exists.
- **Settle for the page on any failure of the hello.** It looks safe — it is how every launch ran
  before — but a lost answer is not a refusal. The shell may already own the session, and the page
  would then boot a second runtime against the same vault. Only a refusal, or a shell with no handler
  at all, tells the page the shell does not own the session.
- **A message per repository method.** Every method a screen gains would need a vocabulary change and
  an app release to answer it. The contract version carries that instead.
- **Define the session snapshot and the commands now.** Their fields are what the page's readers and
  flows need, and those are moved behind the engine one at a time with the core engine as the first
  implementation (the same reasoning ADR-0308 gave for leaving them out of the engine). They are
  added to the contract as each is moved; the contract version stays 1 until the first one ships.
- **A separate vault item for the shell's runtime.** Switching a device between the two modes would
  sign the person out each time, or need a migration in both directions.

## Consequences

- Bridge 2.23.0. The phone and desktop shells list the four requests as unanswered and the two pushes
  as not sent until a shell runs the runtime; a sub WebView page is never answered. The phone shell's
  host does not take `RuntimeHello` as the web being ready, so a cold-start event waits for the page
  that can receive it.
- `@chatic/runtime-core` holds `RUNTIME_CONTRACT_VERSION`, the handshake (`readRuntimeOffer`,
  `answerRuntimeHello`, `settleRuntimeHello`) and the error codec (`toRuntimeFailure`,
  `runtimeNotAvailableFailure`, `reviveRuntimeError`). Nothing calls them yet.
- What a page does when its hello keeps going unanswered is left to the page's mirror; booting its own
  runtime is not one of the options.
- The session snapshot, the commands, the call targets and the events are each added with the change
  that first moves a reader or a command behind the engine.
- While the page sends no hello, nothing changes for anyone.
