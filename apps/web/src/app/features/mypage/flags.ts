/**
 * Feature gates for mypage screens. Each constant is the single switch to flip once its backend
 * dependency ships — see the referenced ADR/roadmap request number. Keeping the gate as one boolean
 * constant (rather than scattering the condition across components) means enabling the real feature
 * later is a one-line change.
 */

/**
 * Whether the social-link "unlink" action is wired to a real backend call.
 *
 * TODO(backend): request #7 — ADR-0033 interface pre-wiring. There is no `auth.detach-social` (or
 * equivalent) packet yet, so the unlink control in `AccountLinkSection` stays disabled and never
 * claims a false success. Flip to `true` once the gateway call exists.
 */
export const SOCIAL_UNLINK_ENABLED = false;

/*
 * `SOCIAL_LINK_ENABLED` used to live here, holding the section back until the backend could say what
 * was actually linked — linking is only half a feature without the read, and the localStorage mirror
 * that stood in for it could lie. `UserView.link$` is that read (ADR-0042 §5), so the gate is gone
 * rather than flipped: `AccountLinkSection` now hides itself whenever `link$` reads `'unknown'`, which
 * is a narrower and self-maintaining version of the same caution.
 */
