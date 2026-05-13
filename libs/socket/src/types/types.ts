/**
 * Socket types re-exported from @lemoncloud/chatic-sockets-lib
 * - Replaces local ClientSocketV2/ClientSocketStatus/ClientSocketError placeholders
 */
export type {
    ClientSocketV2,
    ClientSocketState,
    ClientSocketStateEvent,
    ClientSocketErrorEvent,
    ClientSocketMessageEvent,
    ClientSocketOptions,
    SocketMessage,
    SocketMessageMeta,
    DeviceSocketRuntime,
    DomainSyncPlan,
    DomainSyncContext,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';
