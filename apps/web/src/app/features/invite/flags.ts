/**
 * Interface-pre-wiring gates for the relay 1:1 invite sender flow (ADR-0033 Track B).
 *
 * The Figma designs include actions the backend does not support yet. Rather than build them
 * fully and half-wire them, each gap gets a single boolean here — the UI reads the flag instead
 * of branching on ad-hoc conditions, so flipping a flag (once the backend request lands) is a
 * one-line change with no UI rework. See the roadmap's "백엔드 요청 목록" for the numbered asks.
 */

/** 요청 1 — `invite.cancel` API. Until it exists, cancel is confirm-dialog + local-only hide. */
export const INVITE_CANCEL_API_SUPPORTED = false;

/**
 * 요청 2 — a `rejected`/declined invite state. `MyInviteStatus` is `pending | accepted | expired`
 * today, so nothing can ever resolve to declined and a declined invite is indistinguishable from
 * an expired one. The declined badge and re-invite copy are already built behind this flag
 * (`resolveInviteRowBadge` / `resolveReinviteVariant`), so flipping it is the whole change.
 */
export const INVITE_REJECTED_STATE_SUPPORTED = false;

/**
 * 요청 3 — reissuing an invite to the same phone does not revoke the prior pending code
 * server-side. Until it does, copy must not claim the old link "expires automatically".
 */
export const INVITE_AUTO_REVOKE_ON_REISSUE_SUPPORTED = false;

// 요청 5 (`channelId` timing after acceptance) has no flag on purpose. Treating a missing
// `channelId` as "not yet known" and falling back to a home redirect is what the waiting screen
// should do whether or not the backend pins the timing down, so a flag here would gate nothing —
// see `useAcceptedChannelSync`, which documents the open question where it actually applies.
