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
 * equivalent) packet yet, so the unlink control in `SocialLinkSection` stays disabled and never
 * claims a false success. Flip to `true` once the gateway call exists.
 */
export const SOCIAL_UNLINK_ENABLED = false;
