import { type StorageLike } from './jsonSlot';
import { plainPort } from './ports';
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
 * The registered push token is NOT stored here. It is registration state, not session identity, and
 * it lives in runtime-core's `push/registrationRecord` keyed by account + device + platform — this store
 * is not keyed that way and would hand the next account the previous one's token.
 *
 * Renamed off `IdentityCore` — web-core's `session/core` residue, outside the `I*` convention
 * (ADR-0076 Decision 0).
 */
export interface IIdentityStore {
    getDelegatorId(): string | null;
    setDelegatorId(value: string | null): void;
    /**
     * The device id this page persisted, or null before the first one was made. In an app or desktop
     * shell the shell's own id wins over it (`useDynamicDeviceId`); this is the browser's id, one per
     * tab session.
     */
    getDeviceId(): string | null;
    /**
     * The stored device id, or `make()`'s, stored before returning — so every caller in the same
     * render gets the same id. Announces nothing: no derived session state reads the device id.
     */
    getOrMakeDeviceId(make: () => string): string;
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

    getDeviceId(): string | null {
        return this.storage.get(DEVICE_ID_KEY);
    }

    getOrMakeDeviceId(make: () => string): string {
        const stored = this.storage.get(DEVICE_ID_KEY);
        if (stored) return stored;
        const made = make();
        this.storage.set(DEVICE_ID_KEY, made);
        return made;
    }

    setDeviceId(value: string | null): void {
        this.put(DEVICE_ID_KEY, value);
    }
}

export const identityStore: IIdentityStore = new IdentityStore(plainPort, sessionSignal);
