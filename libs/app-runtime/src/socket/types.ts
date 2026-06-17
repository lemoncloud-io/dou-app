import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

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
 * Internal tracking structure representing a managed active socket client and its configuration.
 */
export interface ManagedSocketRecord {
    /**
     * The socket client instance itself.
     */
    client: ClientSocketV2;
    /**
     * The original configuration that was used to initialize this socket client.
     */
    config: SocketBindingConfig;
    /**
     * Unsubscribe handle for the error listener.
     */
    unsubscribeError?: () => void;
}
