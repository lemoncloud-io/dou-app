# ADR-0043: Move relay invite cancel and reject onto the real API

> Status: Accepted · Decided: 2026-08-04
>
> Related: [ADR-0033](0033-relay-dm-invite-and-auth-parallel-tracks.md) (track structure and the
> stub-ahead-of-the-backend principle) · [ADR-0016](0016-invite-accept-popup-web-ui-kit.md) (accept
> popup case dialogs) · [ADR-0037](0037-invite-accept-popup-group-and-dm-variants.md) (accept popup
> variants).
> This ADR does not overturn ADR-0033 — it fills the slot that document deferred as "backend
> requests 1 and 2".

> **Naming note (2026-09-01):** the `*RemoteDataSource` · `RemoteGatewayBundle` · `*DomainGateway` ·
> `remoteFactory` · `remote/data-sources/` names used in this document are **the names of the time**.
> The mapping after the socket axis moved to the `Socket` prefix is in
> [libs/data/docs/remote/README.md](../../libs/data/docs/remote/README.md#naming-history). This is a
> record, so the body stays as written.

## Context

**Backend requests 1 (cancel) and 2 (reject) from the roadmap have arrived.** The roadmap document
(`docs/plans/relay-dm-invite-parallel-roadmap.md`) lived in the root docs tree, which has since been
removed.

- `@lemoncloud/chatic-sockets-lib@0.4.13` — `cancel` and `reject` added to `InviteGateway`
- `@lemoncloud/chatic-sockets-api@0.26.710` · `@lemoncloud/chatic-backend-api@0.26.709`
- Spec source: `chatic-sockets-api/docs/specs/relay-server-invite` (01-spec Rev 2026-08-04,
  05-client-guide same Rev)

### The contract the spec fixed (what the app follows)

- **There are five states** — `pending`, `accepted`, `canceled`, `rejected`, `expired`
  (`MyInviteStatus`). The `state` filter on `invite.list` takes the same set.
- **Naming trap**: the backend stores `InviteModel.state` as `'cancel' | 'reject'`, but the derived
  `MyInviteView.state` the app sees is `'canceled' | 'rejected'`. That matches the app's
  stubbed-ahead code (`REJECTED_STATE = 'rejected'` in `inviteStatus.ts`), so it is already correct.
- **Cancel is your own invite only** — authorization is session ownership, not the code. Someone
  else's invite is `403`, an already-accepted one is `409`, and an expired invite can still be
  canceled (list cleanup).
- **Reject needs only the code** — no phone verification (`needVerify`). The device user taps it
  right after the deep link.
- **Idempotent** — calling again on an invite that is already final succeeds, and the timestamps
  (`canceledAt`, `rejectedAt`) do not move. The client does not have to block retries.
- **The response `state` is the end of it** — no re-read is needed. A `409` (already accepted) means
  the state diverged, so reload the list and the card to bring the screen in line.
- **There are still no notifications** (request 4 is not implemented) — the inviter's screen refreshes
  by re-polling `invite.list`.
- **There is no undo** — reissuing (`invite.create`) takes that place. The backend auto-cancel
  (request 3) was not built either.

### Where the app stands — stubs are holding the slots

These were built as interfaces ahead of the backend at track integration time (2026-07-29):

| Surface                                                                                  | Current behaviour                                                                                  | Gate                                              |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Cancel button (`InviteWaitingPage`)                                                      | Confirm dialog implemented, **local hide only** (`useLocallyCanceledInvites`)                      | `INVITE_CANCEL_API_SUPPORTED = false`             |
| Reject button (`InviteAcceptScreen`)                                                     | **Close + local record only** (`relayInviteDecline.ts`) — half a feature, nothing reads the record | `RELAY_INVITE_DECLINE_ENABLED = true`             |
| Rejected badge and reinvite copy (`InviteChannelRow`, `ReinviteDialog` declined variant) | **Finished but unreachable**                                                                       | `INVITE_REJECTED_STATE_SUPPORTED = false`         |
| Reissue copy                                                                             | Worded on the assumption that the previous invite is still alive                                   | `INVITE_AUTO_REVOKE_ON_REISSUE_SUPPORTED = false` |
| Recipient-side cancel case                                                               | Cannot tell cancel apart, so the copy is **folded into "invalid invite"**                          | — (waiting on Figma `3079-12304`)                 |

One thing breaks the roadmap's "flipping the flags is the whole change": the `useInviteListRows`
filter only passes `pending` and `expired`, so the rejected badge needs `rejected` to pass too.

### Settled in the interview (2026-08-04)

1. Auto-canceling the existing invite on reissue is **in scope this time** — the client composes it
   as `cancel → create`.
2. Invites that were only canceled locally (`canceledInviteIds`) are **reconciled to the server and
   then discarded**.
3. The reject button gets a **confirm dialog** — Figma `3446-17487`.
4. The recipient deep-link entry cases follow the existing case-dialog design set —
   `3077-11719` (expired) · `3078-12015` (already joined) · `3079-12154` (chat room deleted, stays
   unwired) · `3079-12304` (invite canceled, revived this time) · `3446-17487` (reject confirm).

## Decision

### In scope

1. **Version bumps** — `chatic-sockets-lib 0.4.12→0.4.13`, `chatic-sockets-api 0.26.709→0.26.710`,
   `chatic-backend-api ^0.26.706→0.26.709`.
2. **Wire it through** — add `cancel` and `reject` to the `InviteDomainGateway` `Pick`
   (`libs/data/src/remote/gateways/index.ts`) → `InviteRemoteDataSource` → `InviteRepository` →
   `cancelInvite(code)` and `rejectInvite(code)` on `useRelayInviteMutations`. Widen along the same
   grain as the existing create/get/accept, and leave the data layer structure alone (ADR-0036 waits
   separately).
3. **Replace the cancel stub** — `markCanceled` (local hide) in `InviteWaitingPage` becomes a real
   `invite.cancel`. Decide on `state === 'canceled'` in the response and remove the card. On `409`
   (already accepted), reload the list to bring the screen in line.
4. **Real reject API plus a confirm step** — tapping reject opens a confirm dialog (Figma
   `3446-17487`, the existing `ConfirmDialog` pattern) → `invite.reject` → on `state === 'rejected'`
   close and go home. The position that skips the verification step (right after the deep link) stays
   as it is.
5. **Reissue = cancel then create** — "Invite again" first `cancel`s the existing pending or expired
   invite, then `create`s a new one. If the cancel loses with `409` (already accepted), stop the
   reissue and refresh the list — it means the room already exists. This closes the half-behaviour
   where the old link could still be accepted.
6. **Tidy the recipient case dialogs** — in the `state` branch of `invite.get`, split `canceled` out
   of "invalid invite" to revive the Figma `3079-12304` copy, and add the `rejected` re-entry case
   ("this is an invite you rejected", spec table B-1) using the same AlertDialog pattern. When a
   dedicated design lands, only the copy changes.
7. **List visibility rule** — widen the `useInviteListRows` filter to pass `pending`, `expired`, and
   `rejected`. A `rejected` row shows the rejected badge → tap → the `ReinviteDialog` declined
   variant (a path that is already finished). `canceled` stays hidden from the list — current UX,
   and the filter drops it naturally.
8. **Clear out the local leftovers** —
    - `canceledInviteIds`: after the list loads, fire `invite.cancel` for any recorded invite the
      server does not yet consider final (reconcile). Both success and `409` clear the record. It is
      idempotent, so retrying is safe. Once the records are drained, the reconcile code, the store,
      and the preference key are removed in a follow-up release.
        > **Addendum (2026-08-04, settled during the spec step and ratified by the user):** removing
        > the store entirely is withdrawn. `rejected` is kept on the server forever and does not decay
        > into expired (backend `asInviteState` precedence), so there is no server-side way to clear a
        > rejected row after a reinvite — `canceledInviteIds` lives on in the narrow role of "local
        > dismiss marker for rejected rows". Reconciling and draining the legacy records is unchanged.
        > The detail is the retire rule in `apps/web/docs/feature/invite/relay-invite-sender.md`.
    - `declinedInviteIds`: **discarded immediately** (store and key deleted). It was half a stub that
      nothing read, and now that `invite.get` returns `rejected`, server state takes over its role.
9. **Delete the flags and the stubs** — the four flags `INVITE_CANCEL_API_SUPPORTED`,
   `INVITE_REJECTED_STATE_SUPPORTED`, `RELAY_INVITE_DECLINE_ENABLED`,
   `INVITE_AUTO_REVOKE_ON_REISSUE_SUPPORTED` and the branches that die with them
   (`useLocallyCanceledInvites`, `relayInviteDecline.ts`, the stub copy swaps) are **deleted, not
   flipped**. The flags existed because of a backend gap, and the gap is gone.
10. **Update the contract docs** — widen the `state` union in the roadmap's "interface contract" to
    five values and add the `cancelInvite` and `rejectInvite` signatures (the rule is "change the
    contract, fix the roadmap document first"). Also update the stub description in §6 and §8 of
    `apps/web/docs/feature/invite/relay-invite-accept.md`.

### Out of scope

- **Notifying the inviter of accept, reject, or cancel** — backend request 4 is still unimplemented.
  The 30-second `invite.list` polling stays.
- **Undoing a cancel or a reject** — there is no server path. Reissuing takes that place.
- **`canceledAt` and `rejectedAt` timestamp copy** ("canceled yesterday") — the view already carries
  it, but this round's screens do not ask for it. Follow-up.
- **Wiring "chat room deleted" (`3079-12154`)** — there is no relay trigger, so it stays unwired.
- **Data layer refactoring** — [ADR-0036](0036-data-surface-unification-app-runtime-cleanup.md)
  starts after this work. This wiring moves only inside the existing repositories pattern.

## Alternatives

- **Just discard the local cancel leftovers, or keep reading them only** — discarding brings
  previously canceled invites back into the list, and read-only keeps leftovers that diverge from the
  server forever. Reconcile carries the user's original intent (cancel) to the server, is safe
  because it is idempotent, and lets us delete the code once the records drain. Adopted.
- **Reconcile the declined leftovers too (auto-fire reject)** — dropped. The reject stub's actual UX
  was closer to "close", and auto-firing a final action without the user confirming again is too
  much. If they come back, they can reject again.
- **Leave the reissue composition to the next piece of work** — dropped. The half-behaviour of a live
  old link is on the same axis as the problem this work solves (getting cancel onto the server), and
  now that the cancel API exists it is cheapest.
- **Flip the flags and keep them** — dropped. A flag whose gap is gone only preserves a dead branch
  forever. The resolvers that tested both branches (`resolveInviteRowBadge` and friends) collapse to a
  single path.
- **Wait for the backend auto-cancel (request 3)** — dropped. The spec explicitly closed that path by
  saying reissuing takes its place.

## Consequences

**What is gained**

- The half-behaviours of cancel and reject are gone — a cancel reaches the server so the recipient's
  old link can no longer be accepted, and a reject reaches the inviter as state (the `rejected` badge
  and the declined reinvite copy).
- Deleting two local stub stores, four flags, and the stub modules shrinks the code surface.
- The recipient entry-case screens map 1:1 onto spec table B-1.

**Trade-offs accepted**

- Reconcile logic comes in temporarily — migration code written on the premise that it goes away once
  the leftovers drain.
- The absence of notifications is unchanged, so the inviter's screen still refreshes by polling
  (separate work when request 4 arrives).
- The `rejected` re-entry case starts without a dedicated design, borrowing the existing pattern — the
  copy is adjusted when a design lands.
- The `409` race-handling surface grows to three places: cancel, reject, and reissue. All three
  converge on the same rule — "reload the list to bring the screen in line".

**Next steps** — open a new dev-2_implement session (write the spec, then implement) with this ADR as
the input.
