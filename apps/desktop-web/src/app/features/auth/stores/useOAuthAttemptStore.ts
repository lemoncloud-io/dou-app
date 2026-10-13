import { create } from 'zustand';

import type { OAuthStartIntent } from '../utils/oauthLoginStart';

/** Why a pending link came back without linking. Shown on the account hub's sign-in card. */
export type LinkFailure = 'occupied' | 'typeLinked' | 'failed';

export interface OAuthAttempt {
    provider: string;
    intent: OAuthStartIntent;
    /**
     * Nobody was signed in when the login began, so the device session it runs on was registered by it.
     * While such an attempt is pending the router keeps the Welcome page, and cancelling it signs that
     * session out again: the person never chose to become a guest.
     */
    signedOutAtStart: boolean;
    /** Set once the browser has been sent: the start record's time and nonce, to reopen it. */
    startedAt?: number;
    nonce?: string;
}

interface OAuthAttemptState {
    /** A browser round trip this app began and has not heard back from. */
    attempt: OAuthAttempt | null;
    /** The hand-off for `attempt` came back and failed; the attempt stays so its screen can say so. */
    failed: boolean;
    /** The last link that did not go through, until the person dismisses it. */
    linkFailure: LinkFailure | null;
    /** A code that came back is being exchanged or linked; giving up now would race its outcome. */
    completing: boolean;
    begin: (attempt: OAuthAttempt) => void;
    opened: (startedAt: number, nonce: string) => void;
    fail: () => void;
    clear: () => void;
    setLinkFailure: (failure: LinkFailure | null) => void;
    setCompleting: (completing: boolean) => void;
}

/**
 * The social sign-in or link waiting on the system browser. Kept outside the components because
 * registering the device flips the router mid-attempt, which remounts the page that began it, and
 * because the hand-off is finished by whichever of the deeplink listener or the hand-off page gets it.
 * In memory only: a successful login reloads the app, and an app relaunched by the deeplink has no
 * screen waiting on it.
 */
export const useOAuthAttemptStore = create<OAuthAttemptState>(set => ({
    attempt: null,
    failed: false,
    linkFailure: null,
    completing: false,
    begin: attempt => set({ attempt, failed: false, linkFailure: null }),
    opened: (startedAt, nonce) => set(s => (s.attempt ? { attempt: { ...s.attempt, startedAt, nonce } } : s)),
    fail: () => set(s => (s.attempt ? { failed: true } : s)),
    clear: () => set({ attempt: null, failed: false }),
    setLinkFailure: linkFailure => set({ linkFailure }),
    setCompleting: completing => set({ completing }),
}));

/** A login begun signed out is still waiting: the router keeps the Welcome page for it. */
export const selectHeldLogin = (s: OAuthAttemptState): boolean =>
    s.attempt?.intent === 'login' && s.attempt.signedOutAtStart;

/**
 * The attempt is between steps no button may interrupt: the device is still being registered (the
 * browser has not been sent yet), or the code that came back is being exchanged. Cancelling then would
 * sign out a session the next step is about to use, or replace.
 */
export const selectAttemptBusy = (s: OAuthAttemptState): boolean =>
    s.completing || (s.attempt !== null && s.attempt.startedAt === undefined && !s.failed);
