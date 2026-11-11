import type { AuthPlatformPorts } from '@chatic/auth';
import type { LocalCachePorts } from '@chatic/data';
import type { SessionStoragePorts } from '@chatic/session';
import type { TransportPlatformPorts } from '@chatic/transport';

import type { RuntimeStorePorts } from './storage/runtimeStores';

/**
 * Everything the runtime takes from the platform it runs on, in one object.
 *
 * A port is something the runtime needs and cannot provide for itself without knowing whether it
 * is in a browser tab or in a native process: where the session is stored, how a socket is opened,
 * what "online" means. The package that uses a port declares its type; this interface is where the
 * ports are collected so that one caller fills all of them.
 *
 * **Every field is required, and stays required.** A port left out has no neutral fallback — the
 * only values a default could reach for are one platform's (this tab's `sessionStorage`, the page's
 * `navigator`), and a runtime that silently runs on those in the wrong place is the failure this
 * shape exists to rule out. So an adapter that forgets a port does not compile, and a port added
 * here breaks every adapter until each one answers it. `RuntimePortsAreRequired` below is what
 * keeps a `?` from being added later.
 *
 * It grows one field at a time, as each wiring point a package still fills for itself becomes a
 * port.
 */
export interface RuntimePorts {
    /**
     * The stores the runtime keeps state in, chosen by the entry point for its environment. `secret`
     * and `plain` back the session's two ports — the credentials and everything else it keeps;
     * `device` backs the runtime's own non-session state (the sync cursor watermark). In a page they
     * come from `resolveStorageStores()`.
     */
    storage: SessionStoragePorts & RuntimeStorePorts;
    /** The network signal, the device's self-description and how a socket is opened. */
    transport: TransportPlatformPorts;
    /** The address the boot reads the logout flag from, and the way home when a session ends. */
    auth: AuthPlatformPorts;
    /** Where the cache's rows live: each domain's store, the search across clouds, the metrics. */
    cache: LocalCachePorts;
}

/** The keys of `T` a caller may leave out. */
export type OptionalKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];

/** `true` when no field of `T` is optional. */
export type AllRequired<T> = [OptionalKeys<T>] extends [never] ? true : false;

type Assert<T extends true> = T;

/**
 * Stops compiling the moment a field of `RuntimePorts` is declared optional. It has no other use;
 * it is exported only because an unused local type is itself a compile error.
 */
export type RuntimePortsAreRequired = Assert<AllRequired<RuntimePorts>>;
