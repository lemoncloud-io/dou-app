# ADR-0124: Upload answers are checked against the `lemon-model` contract, not a local mirror

> Status: Accepted · Decided: 2026-09-29 · Implemented: `chore/lemon-model-pin`
> · Scope: root `package.json` `resolutions` · `libs/data/src/uploads/types.ts` ·
> `libs/data/src/remote/socket-data-sources/UploadSocketDataSource.ts` ·
> `libs/data/src/repositories/ChatRepository.ts`
> · Amends: [ADR-0121](./0121-an-image-send-runs-in-the-data-layer-over-a-put-port.md) decision 4 — the
> local response mirror is gone, and the guard checks answers against the contract types instead

## Context

The root `package.json` pinned `lemon-model` to 1.2.2 through `resolutions`. The pin came in with a
dependency update and no stated reason. `@lemoncloud/chatic-socials-api` asks for `^1.5.0`, so the pin
held it below its own range. The SDK re-exports its upload types (`UploadStartResult`, `UploadTicket`,
`UploadCompleteResult`, …) from `lemon-model/upload`, an entry point 1.2.2 does not have, and under
`skipLibCheck` every one of them was silently `any`.

ADR-0121 worked around that with a hand-kept mirror of the fields the image send reads, plus a runtime
guard, and said the mirror would go once the pin reached 1.5. The lemon-model ranges the type packages
ask for, measured 2026-09-29: socials-api `^1.5.0`, sockets-api `^1.2.2`, backend-api, pushes-api
`^1.1.1`, iap-api, boards-api `^1.0.5`. 1.5.0 satisfies all of them and is the current release.

## Decision

1. **The pin is 1.5.0.** It stays a pin rather than being dropped, because the pin is what keeps one
   copy of `lemon-model` in the tree: every type package then describes the same models. It has to
   sit at or above the highest lemon-model range any of those packages asks for.
2. **The upload answer types come from the SDK.** `libs/data` imports them from
   `@lemoncloud/chatic-socials-api`, not from `lemon-model/upload`. The SDK is the declared dependency
   and the server's own statement of the wire shape. `lemon-model` is only reached through it.
3. **The guard stays, and narrows to the contract.** The socket gateway's `start` / `complete` cast
   whatever arrived to the type asked for, so real types do not make the answer checked. The guard
   now checks each upload's `id` · `status` · `error` and every field of a presigned PUT (`kind` ·
   `method` · `url` · `headers` · `maxBytes`, and `expiresAt` when present). It copies only those
   fields, and it still fails the whole operation on a mismatch.
4. **The guard's result is narrower than the contract, and still assignable to it.** The contract
   also has an inline transfer, delivered through a `send` operation the socket surface does not
   have. `PresignedUploadTicket` types `transfer` as the presigned PUT only, and the guard rejects
   any other kind. An upload comes out as `CheckedUpload`, a `Pick` of the contract's `Upload`, so the
   type does not promise the `url` of a stored upload that the guard dropped.

## Alternatives

- **Drop the guard now that the types are real.** Rejected: the types describe what the server
  promises, and the gateway does not check that promise. Without the guard, a server that answered
  a different shape would reach the PUT senders as a typed value, and a missing `url` would surface
  as a failed PUT instead of a failed `start`.
- **Check only what the send reads**, a transfer's `url` and `headers`. Rejected for the transfer:
  `kind` is what tells a presigned PUT from an inline one, and once it is checked, the few other
  required fields cost little, and the transfer can be the contract's own type. An upload's other
  fields are all optional, so there the guard does keep only what the send reads (`CheckedUpload`).
- **Import from `lemon-model/upload` directly.** It names `Upload`, which the SDK does not re-export,
  but it would add a second source for the same types and a dependency the repo does not declare.
- **Remove the `resolutions` entry.** Every range is `^1.x`, so yarn would most likely pick one copy
  anyway. But "most likely" is what the pin exists to remove.

## Consequences

- A presigned transfer without `kind`, `method` or `maxBytes` now fails `upload.start`, where the
  mirror accepted it. The server builds its tickets against the same contract, so this is not
  expected to happen. The image send is not wired to a screen yet, so no user sees the change.
- Every type package now sees `lemon-model` 1.5.0, not only socials-api.
- Raising a `chatic-*` type package means checking its `lemon-model` range against the pin. Below the
  range, the types it re-exports can go back to `any` without an error.
- A status the contract adds fails to compile in the guard, so the guard cannot silently reject it.
- `PendingUploadSlot` and the widened `CacheChatView.upload$$` are local state, not a mirror, and
  stay as ADR-0121 describes them.
- Adopting the `lemon-model` upload engine, which ADR-0121 turned down while the pin held, is now
  only a question about the engine.
