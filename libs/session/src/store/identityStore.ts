import { type StorageLike } from './jsonSlot';
import { DELEGATOR_ID_KEY, plainPort, secretPort } from './ports';
import { sessionSignal, type ISessionSignal } from './signal';

const DEVICE_ID_KEY = 'chatic-device-id';

export interface IIdentityStore {
    getDelegatorId(): string | null;
    setDelegatorId(value: string | null): void;
    getDeviceId(): string | null;
    getOrMakeDeviceId(make: () => string): string;
    setDeviceId(value: string | null): void;
}

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
