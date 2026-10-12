import { config } from '@chatic/config';

/**
 * Phone-number sign-in is off in production for the reason Google sign-in is: the backend restores
 * only the clouds an account owns, so someone signing in here would not find the clouds they were
 * invited into. Read per call — `config.get()` answers nothing until boot has run `config.init()`.
 */
export const isPhoneLoginEnabled = (): boolean => config.get<boolean>('feature.auth.phoneLogin') !== false;

/**
 * The note beside a Google button for people who signed up on mobile with a phone number: Google
 * makes them a new account unless Google is linked to theirs. Where phone sign-in is on, the note
 * points at it, and at linking Google from the account hub once in; otherwise at the mobile app.
 */
export const phoneSignupNoteKey = (): 'auth.social.phoneSignupNote' | 'auth.social.phoneSignupNotePhone' =>
    isPhoneLoginEnabled() ? 'auth.social.phoneSignupNotePhone' : 'auth.social.phoneSignupNote';

/**
 * The phone sign-in button's fill. It is a secondary button, weighted between the lime primary and
 * Google's outline; in dark the secondary fill is near-black, heavier than both, so it takes the
 * lifted grey there instead.
 */
export const PHONE_BUTTON_CLASS = 'dark:bg-accent dark:hover:bg-accent/80';
