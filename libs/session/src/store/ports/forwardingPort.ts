import type { StorageLike } from '../jsonSlot';
import type { ISessionStores, PortName } from './types';

/**
 * A port the session's stores hold for their lifetime. It forwards every call to whatever
 * `KeyValueStore` backs the port now, so the session's stores can be built at import while their
 * storage is chosen later, at boot.
 */
export class ForwardingPort implements StorageLike {
    constructor(
        private readonly stores: ISessionStores,
        private readonly port: PortName
    ) {}

    get(key: string): string | null {
        return this.stores.of(this.port).get(key);
    }

    set(key: string, value: string): void {
        this.stores.of(this.port).set(key, value);
    }

    remove(key: string): void {
        this.stores.of(this.port).remove(key);
    }
}
