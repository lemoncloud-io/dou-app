# ADR-0116: The active socket slot is a pointer the binder sets, not inferred from what is bound

> Status: Accepted (decision 3's switch order and reconcile key are amended → [ADR-0119](0119-every-joined-cloud-keeps-a-socket-session.md)) · Decided: 2026-09-28 · Implemented: `refactor/socket-active-pointer`
> · Scope: `libs/app-runtime/src/socket/SocketManager.ts` · `libs/app-runtime/src/connection/SocketBinder.tsx`
> · Supersedes: decision 5 of [ADR-0115](./0115-a-socket-slot-is-keyed-by-the-cloud-it-serves.md) (at most
> one cloud slot, enforced by `ensure`)
> · The module doc is [libs/app-runtime/docs/socket](../../libs/app-runtime/docs/socket/README.md#the-active-slot-is-a-pointer)

## Context

ADR-0115 keyed socket slots by the cloud they serve, and deliberately kept one rule from the role-keyed
design: at most one cloud slot. `ensure` enforced it by tearing down any other cloud's slot inside the
same call that bound the next one. That rule was also what made the **active slot** computable — "the
cloud slot if one is bound, else relay" — because there was never more than one cloud slot to choose
from.

Two things were left resting on that inference:

- **The active slot could not be named, only derived.** The moment two cloud slots exist — even for the
  instant a switch binds the incoming cloud before the outgoing one is gone — "the cloud slot" names
  nothing. Holding a background socket per joined cloud, which is where this work is going, is
  impossible while the manager decides for itself which slot is active.
- **The order of a switch was not decided anywhere.** `SocketBinder` ran two independent effects, one per
  role. A switch was "the cloud role's effect reboots, and `ensure` quietly removes the old cloud on the
  way", so the teardown of A happened inside the bind of B, before the active facade moved. A's sync
  targets were then stopped by A's runtime being detached rather than by moving off a runtime still
  alive.

A dedicated guard also reported a switch between two clouds on the same wss host as unsupported, because
under role keys the reboot key did not move. Cid keys already made that case an ordinary switch.

## Decision

1. **`setActiveSlot(key | null)` names the active slot.** `null` means relay. The effective active slot
   is the named key while it is bound, and relay otherwise, so the pointer can be set before its slot
   binds and survives the slot being torn down. `destroy()` with no key clears it. Every call resyncs
   the facade, as every `ensure` and `destroy` already did.
2. **`ensure` touches no other slot.** The manager no longer limits the number of cloud slots. The binder
   asks for the ones the session needs, which is still one committed cloud.
3. **One reconcile pass owns every slot, in a fixed order:** bind every new or rebooted slot, point the
   facade, then tear down every slot the manager holds that is no longer asked for. A switch reads
   `slot bound B → active moved B → slot torn down A`, and the active client goes from A straight to B.
   Teardown reads the manager's slot list rather than the binder's memory, because a remount starts with
   an empty memory.
4. **The same-wss guard is removed.** A different cid is a different slot whatever its URL.
5. **The slot lifecycle is logged** — `slot bound`, `active moved`, `slot torn down` — so the order above,
   and a relay slot that should not have moved, are visible in a device log.

## Alternatives

- **Keep inferring, with a tie-break** — "the most recently bound cloud slot". It would pick B during a
  switch, but it hides the decision inside the manager again, and it has no answer for a background
  slot that is bound later without being the one the user looks at.
- **Keep the one-cloud rule in `ensure` and add only the pointer.** Smallest change, but it keeps the
  teardown of A inside the bind of B, so the facade would still have to move after A is already gone —
  the order this decision exists to fix.
- **Tear down first, then bind.** Simple to reason about, but the facade passes through relay for the
  length of the switch, and every active-client consumer (sync targets, request gating) sees a relay
  socket in between.

## Consequences

- For one synchronous pass during a switch, two cloud slots are bound. Nothing awaits inside the pass, so
  no consumer can observe it, and B does not connect until after A is torn down: `bootstrapSocketConnection`
  binds before its first `await` and connects after it. The defensive branch for a client without an auth
  controller connects immediately, so the claim holds on the auth path only.
- A slot whose bootstrap fails is forgotten by the binder, so the next reconcile tries again; until then
  the pointer names an unbound slot and the facade stays on relay, and that is logged.
- `ISocketManager` gains one member. Test fakes of the manager that stand in for the binder need
  `setActiveSlot` and `getSlotKeys`.
- Nothing changes for a user: the same slots exist and requests go where they went. What changes is that
  the next step — a slot per joined cloud — needs no further change to how the active slot is chosen.
