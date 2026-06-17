import type { ClientSocketState } from '@lemoncloud/chatic-sockets-lib';

/**
 * Unique identifier for a specific cloud environment or tenant connection context.
 */
export type SocketCloudId = string;

/**
 * Configuration options required to initialize and bind a socket connection.
 */
export interface SocketBindingConfig {
    /**
     * The destination WebSocket server URL.
     */
    url: string;
    /**
     * A unique identifier representing the user's device.
     */
    deviceId: string;
    /**
     * The type of the WebSocket connection, distinguishing between relaying or direct cloud connection.
     */
    wssType?: 'relay' | 'cloud';
}

/**
 * Scope the socket is currently bound to. A change in any field (cloud, site, user)
 * is treated as a scope switch and always forces a fresh socket connection.
 */
export interface SocketScope {
    /** cloudId — null when unbound. */
    cid: string | null;
    /** siteId — null when no place is selected. */
    sid: string | null;
    /** userId — null until the profile is resolved. */
    uid: string | null;
}

/**
 * Comprehensive, observable state of the single managed socket.
 * Connection fields follow ClientSocketV2; handshake fields (`isVerified`,
 * `isDeviceRegistered`, `connectionId`) are derived from app-level acknowledgements.
 */
export interface SocketState {
    /** Currently bound cloudId. */
    cloudId: string | null;
    /** Currently bound siteId. */
    siteId: string | null;
    /** Currently bound userId. */
    userId: string | null;
    /** Raw transport state. */
    state: ClientSocketState;
    /** Shorthand for `state === 'connected'`. */
    isConnected: boolean;
    /** True once `auth.update:ok` has been acknowledged for this connection. */
    isVerified: boolean;
    /** True once `device.save:ok` / `device.read:ok` has been acknowledged. */
    isDeviceRegistered: boolean;
    /** Server-assigned connection id, when known. */
    connectionId: string | null;
}
