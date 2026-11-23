import type { AuthPlatformPorts } from '@chatic/auth';
import type { LocalCachePorts } from '@chatic/data';
import type { SessionStoragePorts } from '@chatic/session';
import type { TransportPlatformPorts } from '@chatic/transport';

import type { ForegroundSignal } from './session/foreground';
import type { RuntimeStorePorts } from './storage/runtimeStores';

export interface RuntimePorts {
    storage: SessionStoragePorts & RuntimeStorePorts;
    transport: TransportPlatformPorts;
    auth: AuthPlatformPorts;
    cache: LocalCachePorts;
    foreground: ForegroundSignal;
}

export type OptionalKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];

export type AllRequired<T> = [OptionalKeys<T>] extends [never] ? true : false;

type Assert<T extends true> = T;

export type RuntimePortsAreRequired = Assert<AllRequired<RuntimePorts>>;
