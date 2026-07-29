// Home feature flags — build-time constants that gate UI whose backend is not there yet.
//
// The relay 1:1 invite work ships designed-but-unbacked affordances on purpose (ADR-0033 D1
// "인터페이스 선반영"): the screens are built against the final design so that wiring the API later
// is a one-line change rather than a redesign. Each such control is gated here so hiding or
// disabling it is also a one-line change, and so `grep` over this file answers "what is still fake".
//
// These are plain consts, not runtime config: they flip with a deploy, and the dead branch is
// dropped by the bundler.

/**
 * Show the "거절" (decline) button on the relay invite accept popup.
 *
 * TODO(backend): 2번 — ADR-0033 인터페이스 선반영. There is no reject API and no `rejected` invite
 * state, so the button only closes the popup and records the decline locally; the inviter is never
 * told. Flip to `false` to hide it until the API lands.
 */
export const RELAY_INVITE_DECLINE_ENABLED = true;
