import type { AuthPlatformPorts } from '@chatic/auth';
import type { DbPort } from '@chatic/data';
import type { SessionStoragePorts } from '@chatic/session';
import type { KeyValueStore } from '@chatic/storage-compose';
import type { TransportPlatformPorts } from '@chatic/transport';

export interface ForegroundPort {
    read(): boolean;
    subscribe(listener: () => void): () => void;
}

export interface DeviceStorePort {
    device: KeyValueStore;
}

export type { KeyValueStore };

export interface StoragePorts {
    secret: KeyValueStore;
    plain: KeyValueStore;
    device: KeyValueStore;
    tab: KeyValueStore;
}

export type StorageRole = keyof StoragePorts;

export type StoragePort = SessionStoragePorts & DeviceStorePort & Partial<Pick<StoragePorts, 'tab'>>;
export type TransportPort = TransportPlatformPorts;
export type AuthPort = AuthPlatformPorts;
export type { DbPort };
export type CachePort = DbPort;

export interface RuntimePorts {
    storage: StoragePort;
    transport: TransportPort;
    auth: AuthPort;
    cache: DbPort;
    foreground: ForegroundPort;
}

export type ForegroundSignal = ForegroundPort;
export type RuntimeStorePorts = DeviceStorePort;

export type OptionalKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];

export type AllRequired<T> = [OptionalKeys<T>] extends [never] ? true : false;

type Assert<T extends true> = T;

export type RuntimePortsAreRequired = Assert<AllRequired<RuntimePorts>>;
