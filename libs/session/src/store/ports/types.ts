import type { KeyValueStore } from '@chatic/storage';

import type { StorageLike } from '../jsonSlot';

export interface SessionStoragePorts {
    secret: KeyValueStore;
    plain: KeyValueStore;
}

export type PortName = keyof SessionStoragePorts;

export interface ISessionStores {
    configure(ports: SessionStoragePorts): void;
    of(port: PortName): KeyValueStore;
}

export interface StoragePortPair {
    secret: StorageLike;
    plain: StorageLike;
}

export interface IRawSlot {
    read(): string | null;
    write(raw: string): void;
    clear(): void;
}
