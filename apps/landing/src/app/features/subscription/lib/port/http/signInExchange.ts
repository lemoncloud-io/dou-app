import type { KeyValueStore } from '@chatic/storage';

import type { SignInProvider } from '../../../types';

/** Where this browser keeps the device id its guest session signs in with. */
export const DEVICE_ID_KEY = 'subscription.deviceId';

/**
 * This browser's device id: kept in the browser's own storage, not the tab's, so every sign-in from it
 * starts from the same device guest instead of making a new one per tab. Made on first use.
 */
export const readDeviceId = (store: KeyValueStore, make: () => string = () => crypto.randomUUID()): string => {
    const kept = store.get(DEVICE_ID_KEY);
    if (kept) return kept;
    const made = make();
    store.set(DEVICE_ID_KEY, made);
    return made;
};

export interface SignInSession {
    /** Whether a relay session is on this tab now. */
    isAuthenticated(): boolean;
    /** Signs this tab in as the device's guest. */
    loginGuest(deviceId: string): Promise<unknown>;
    /** Exchanges the code, signed with the current session, for the account's session. */
    exchangeLinked(provider: SignInProvider, code: string): Promise<unknown>;
}

/**
 * Turns the OAuth relay's code into the account's session the way the apps do, so a sign-in here lands
 * on the same account as the phone and the desktop app.
 *
 * The code is exchanged signed with a session (`verify-oauth-code`): the server then finds the user by
 * the provider's own account id alone, as the phone's native sign-in does, and records the guest as the
 * session's link. The sessionless exchange finds the user by the provider's email first, which need not
 * be the user the app signs in as, so a subscription bought here could belong to an account the app does
 * not use. Without a session the server will not take the signed exchange, so the device's guest signs
 * in first.
 */
export const exchangeSignInCode = async (
    session: SignInSession,
    deviceId: () => string,
    provider: SignInProvider,
    code: string
): Promise<void> => {
    if (!session.isAuthenticated()) await session.loginGuest(deviceId());
    await session.exchangeLinked(provider, code);
};
