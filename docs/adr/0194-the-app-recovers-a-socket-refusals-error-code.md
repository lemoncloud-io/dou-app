# ADR-0194: The app recovers a socket refusal's `errorCode` itself

> Status: Accepted · Decided: 2026-10-13 · Implemented: `fix/socket-error-code`
> · Supersedes the `errorCode` non-goal of [ADR-0042](./0042-account-linking-unified-path-migration.md)
> · Scope: `libs/app-runtime/src/socket/utils/errorCodeLedger.ts` · `libs/app-runtime/src/socket/SocketManager.ts`
> · The module doc is [libs/app-runtime socket](../../libs/transport/docs/socket/README.md#failed-requests-get-a-name-and-a-volume-policy)

## Context

A refused socket request comes back as a frame `{type: '<type>:error', mid, error, errorCode}`.
chatic-sockets-lib rejects the pending request with ``new Error(`${error} - ${type}`)`` and drops
`errorCode`. Everything in the app that reacts to a refusal branches on the status through
`getSocketErrorCode` — the failure reporter, the web's error copy, the request trace, and the state
outbox, which tells a final refusal from a failure worth retrying by it. With the code gone, the status
can only come from a leading `4xx` in the message.

ADR-0042 accepted that: putting `errorCode` on the Error was left to the SDK, and branching on the
message prefix was listed as a consequence. It held for as long as the server's messages carried their
status. They do not all do so. The server codes a failure from its own message — the leading status
when there is one, and 400 for a parameter check such as `@chatNo[999] is invalid - overflow[5]`, which
has nothing in front. Measured against the dev relay on 2026-10-13, an overflowing `chat.read` answered
`errorCode: 400` and reached the app as an Error with no status at all. The client's own failures
(`499`, `503`, `408`) are always prefixed, so the one kind of failure the app could not classify was
the one the server had decided. The state outbox showed what that costs: a real 400 was retried as if
it were transient, while its e2e fixtures, which throw `403 …` strings, passed.

## Decision

`SocketManager` recovers the code. Each slot keeps a small ledger fed by that slot client's
`onMessage`: a `*:error` frame that answers a request (it has a `mid`) with a numeric `errorCode` is
remembered under the exact text the SDK will reject with. In the facade's catch — the active facade's
and every scoped client's — the code is set on the rejected Error as `errorCode` before anything else
reads it. `getSocketErrorCode` already prefers a carried code to the prefix, so no consumer changes.

The key is the message text because the SDK hands back nothing else that ties a rejection to its frame:
`request()` takes no `mid`, and the Error carries none.

## Alternatives

- **Wait for the SDK to attach `errorCode`.** The right home, and still wanted — the ledger becomes dead
  code the day it ships and can be removed then. Not in the app's hands, and every refusal meanwhile
  is misclassified.
- **Match by `mid`, supplied through the SDK's `createMid` option.** `createMid` takes no arguments, so
  tying a generated `mid` to one `request()` call relies on the SDK calling it synchronously inside that
  call. If that changed, a code would land on the wrong request — a worse failure than no code.
- **Rewrite the frame's `error` to start with its status (`shouldHandleMessage`).** Recovers the status
  through the existing prefix parser, but changes the text every listener and log line sees, and fakes
  a server message the server never sent.
- **Parse the server's validation wording in the app.** The wording is not a contract, and copying the
  server's rule would drift from it.

## Consequences

- **A server refusal classifies.** Consumers that branch on 400 now see it for a parameter check: the
  failure reporter logs `400` instead of `unclassified`, the request trace's outcome becomes `400`
  instead of `error`, and the 400 copy in the web (phone verification, relay invite) and in
  desktop-web (phone sign-in) shows where the generic failure did before.
- **Two SDK behaviours are relied on that it does not promise:** the exact rejection text, and running
  `onMessage` listeners synchronously after the rejection and before any `catch` resumes. A test drives
  the real SDK client over a fake socket so an upgrade that changes either fails it. If one does change
  unnoticed, the ledger finds no match and the failure reads as it did before — never a code on the
  wrong request.
- **Only requests made through the facade are covered.** Requests the SDK sends itself (`device.save`,
  `auth.update`, a sync plan's catch-up) keep only the prefix.
