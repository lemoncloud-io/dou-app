import { storage } from '@chatic/shared';

import { type StorageLike } from './jsonSlot';
import { sessionSignal, type ISessionSignal } from './signal';

const DELEGATOR_ID_KEY = 'chatic-delegator-id';
const DEVICE_ID_KEY = 'chatic-device-id';

/**
 * Profile payloads, the guest flag, the invite flag, and the OAuth provider are no longer stored
 * here — the raw session token (relayStore/cloudStore) is the persisted credential, profile facts
 * (guest/role) are tracked from the token + repo cache (useProfileFacts), and invited-ness lives in
 * the cached cloud (`cloudType: 'invited'`). Only the delegator id remains as session-level identity
 * state.
 *
 * The registered push token is NOT stored here any more. It backed a token-equality dedup in the
 * deleted `useRegisterDeviceToken`, and that dedup is the strategy this runtime deliberately rejects:
 * SNS disables a platform endpoint after a single failed delivery, so skipping a re-register because
 * the token string matched left the device permanently dark. `push/hooks/useDeviceTokenRegistration` always
 * registers with `force: true` instead (see its doc), which needs no stored copy.
 *
 * Renamed off `IdentityCore` — web-core's `session/core` residue, outside the `I*` convention
 * (ADR-0076 결정 0).
 */
export interface IIdentityStore {
    getDelegatorId(): string | null;
    setDelegatorId(value: string | null): void;
    setDeviceId(value: string | null): void;
}

class IdentityStore implements IIdentityStore {
    constructor(
        private readonly storage: StorageLike,
        private readonly signal: ISessionSignal
    ) {}

    private put(key: string, value: string | null): void {
        if (value) {
            this.storage.set(key, value);
        } else {
            this.storage.remove(key);
        }
        this.signal.emit('identity');
    }

    getDelegatorId(): string | null {
        return this.storage.get(DELEGATOR_ID_KEY);
    }

    setDelegatorId(value: string | null): void {
        this.put(DELEGATOR_ID_KEY, value);
    }

    setDeviceId(value: string | null): void {
        this.put(DEVICE_ID_KEY, value);
    }
}

export const identityStore: IIdentityStore = new IdentityStore(storage, sessionSignal);
