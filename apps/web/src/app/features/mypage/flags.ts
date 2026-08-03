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

/**
 * Whether the social-link section is shown at all.
 *
 * Held back for now: linking is only half a feature without a way to READ what is linked. There is
 * no list packet (ADR-0033 D7 — 백엔드 요청 #6), so `useSocialLinks` mirrors the attach result in
 * localStorage and the "연동됨" state it renders is a local guess, not server truth — it survives a
 * cache wipe as "not linked" and never reflects a link made on another device. Showing an
 * account-security control that can lie is worse than not showing it.
 *
 * Everything below it stays wired, so enabling is this one line once the list packet lands (and
 * SOCIAL_UNLINK_ENABLED once detach does).
 */
export const SOCIAL_LINK_ENABLED = false;
