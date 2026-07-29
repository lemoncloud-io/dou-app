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

/** 요청 2 — a `rejected`/declined invite state. Until it exists, declined rows read as expired. */
export const INVITE_REJECTED_STATE_SUPPORTED = false;

/**
 * 요청 3 — reissuing an invite to the same phone does not revoke the prior pending code
 * server-side. Until it does, copy must not claim the old link "expires automatically".
 */
export const INVITE_AUTO_REVOKE_ON_REISSUE_SUPPORTED = false;

/**
 * 요청 5 — the timing of `channelId` landing on the invite view after acceptance is not
 * finalized. Until it is, the waiting screen treats a missing `channelId` as "not yet known"
 * rather than an error, and falls back to a home redirect instead of a hard failure.
 */
export const INVITE_ACCEPT_CHANNEL_ID_TIMING_CONFIRMED = false;
