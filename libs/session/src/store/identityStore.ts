import { type StorageLike } from './jsonSlot';
import { DELEGATOR_ID_KEY, plainPort, secretPort } from './ports';
import { sessionSignal, type ISessionSignal } from './signal';

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

/**
 * The delegator id is kept in both ports, and read from the secret one first.
 *
 * It is a device fact rather than a secret: the guest the server registers for this device, the user
 * an invited cloud is accepted under. Inside a shell it has to be readable by whichever side owns the
 * session, and the secret port is the one store both sides share — the device vault, under the same
 * item and keys. The plain port is the page's own `localStorage` and the phone runtime's own file, so a
 * value kept only there is invisible to the other side, and an account signed in for a long time never
 * logs in as a guest again to write it anew. Without it the invited clouds the account accepted are
 * hidden from it and a new invite cannot be accepted.
 *
 * The plain copy is kept and written alongside rather than moved: an older web build reads only that
 * one, and it is what a boot copies into a vault that lacks the id (`secretStorageMigration`). Both
 * copies are written together and cleared together, and they only ever hold this device's guest, so
 * when they differ (a session the other side ended) either one names the same user.
 */
class IdentityStore implements IIdentityStore {
    constructor(
        private readonly storage: StorageLike,
        private readonly secret: StorageLike,
        private readonly signal: ISessionSignal
    ) {}

    private put(key: string, value: string | null, stores: StorageLike[] = [this.storage]): void {
        stores.forEach(store => (value ? store.set(key, value) : store.remove(key)));
        this.signal.emit('identity');
    }

    getDelegatorId(): string | null {
        return this.secret.get(DELEGATOR_ID_KEY) ?? this.storage.get(DELEGATOR_ID_KEY);
    }

    setDelegatorId(value: string | null): void {
        this.put(DELEGATOR_ID_KEY, value, [this.secret, this.storage]);
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

export const identityStore: IIdentityStore = new IdentityStore(plainPort, secretPort, sessionSignal);
