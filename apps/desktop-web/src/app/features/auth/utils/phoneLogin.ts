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
