import { storage } from '@chatic/shared';

import { notifySessionStateChanged } from '../utils';

const DELEGATOR_ID_KEY = 'chatic-delegator-id';
const DEVICE_ID_KEY = 'chatic-device-id';
const REGISTERED_DEVICE_TOKEN_KEY = 'chatic-registered-device-token';

// Profile payloads, the guest flag, the invite flag, and the OAuth provider are no longer stored
// here — the raw session token (relayCore/cloudCore) is the persisted credential, profile facts
// (guest/role) are tracked from the token + repo cache (useProfileFacts), and invited-ness lives in
// the cached cloud (`cloudType: 'invited'`). Only the delegator id, device id, and registered
// device token remain as session-level identity state.
interface IdentityCore {
    getDelegatorId(): string | null;
    setDelegatorId(value: string | null): void;
    getDeviceId(): string | null;
    setDeviceId(value: string | null): void;
    getRegisteredDeviceToken(): string | null;
    setRegisteredDeviceToken(token: string | null): void;
    clearIdentity(): void;
}

export const identityCore: IdentityCore = {
    getDelegatorId: (): string | null => storage.get(DELEGATOR_ID_KEY),
    setDelegatorId: (value: string | null): void => {
        if (value) {
            storage.set(DELEGATOR_ID_KEY, value);
        } else {
            storage.remove(DELEGATOR_ID_KEY);
        }
        notifySessionStateChanged();
    },
    getDeviceId: (): string | null => storage.get(DEVICE_ID_KEY),
    setDeviceId: (value: string | null): void => {
        if (value) {
            storage.set(DEVICE_ID_KEY, value);
        } else {
            storage.remove(DEVICE_ID_KEY);
        }
        notifySessionStateChanged();
    },
    getRegisteredDeviceToken: (): string | null => storage.get(REGISTERED_DEVICE_TOKEN_KEY),
    setRegisteredDeviceToken: (token: string | null): void => {
        if (token) {
            storage.set(REGISTERED_DEVICE_TOKEN_KEY, token);
        } else {
            storage.remove(REGISTERED_DEVICE_TOKEN_KEY);
        }
    },
    clearIdentity: (): void => {
        storage.remove(DELEGATOR_ID_KEY);
        notifySessionStateChanged();
    },
};
