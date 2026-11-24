import type { KeyValueStore } from '@chatic/storage';

import type { SignInProvider } from '@chatic/web-checkout';

export const DEVICE_ID_KEY = 'subscription.deviceId';

export const readDeviceId = (store: KeyValueStore, make: () => string = () => crypto.randomUUID()): string => {
    const kept = store.get(DEVICE_ID_KEY);
    if (kept) return kept;
    const made = make();
    store.set(DEVICE_ID_KEY, made);
    return made;
};

export interface SignInSession {
    loginGuest(deviceId: string): Promise<unknown>;
    exchangeLinked(provider: SignInProvider, code: string): Promise<unknown>;
}

export const exchangeSignInCode = async (
    session: SignInSession,
    deviceId: () => string,
    provider: SignInProvider,
    code: string
): Promise<void> => {
    await session.loginGuest(deviceId());
    await session.exchangeLinked(provider, code);
};
