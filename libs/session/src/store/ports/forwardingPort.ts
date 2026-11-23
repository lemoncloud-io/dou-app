import type { StorageLike } from '../jsonSlot';
import type { ISessionStores, PortName } from './types';

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
