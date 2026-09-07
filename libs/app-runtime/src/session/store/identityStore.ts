import { storage } from '@chatic/shared';

import { sessionSignal } from './signal';

const DELEGATOR_ID_KEY = 'chatic-delegator-id';
const DEVICE_ID_KEY = 'chatic-device-id';

// Profile payloads, the guest flag, the invite flag, and the OAuth provider are no longer stored
// here — the raw session token (relayStore/cloudStore) is the persisted credential, profile facts
// (guest/role) are tracked from the token + repo cache (useProfileFacts), and invited-ness lives in
// the cached cloud (`cloudType: 'invited'`). Only the delegator id remains as session-level identity
// state.
//
// The registered push token is NOT stored here any more. It backed a token-equality dedup in the
// deleted `useRegisterDeviceToken`, and that dedup is the strategy this runtime deliberately rejects:
// SNS disables a platform endpoint after a single failed delivery, so skipping a re-register because
// the token string matched left the device permanently dark. `push/useDeviceTokenRegistration` always
// registers with `force: true` instead (see its doc), which needs no stored copy.
interface IdentityCore {
    getDelegatorId(): string | null;
    setDelegatorId(value: string | null): void;
    setDeviceId(value: string | null): void;
}

export const identityStore: IdentityCore = {
    getDelegatorId: (): string | null => storage.get(DELEGATOR_ID_KEY),
    setDelegatorId: (value: string | null): void => {
        if (value) {
            storage.set(DELEGATOR_ID_KEY, value);
        } else {
            storage.remove(DELEGATOR_ID_KEY);
        }
        sessionSignal.emit('identity');
    },
    setDeviceId: (value: string | null): void => {
        if (value) {
            storage.set(DEVICE_ID_KEY, value);
        } else {
            storage.remove(DEVICE_ID_KEY);
        }
        sessionSignal.emit('identity');
    },
};
