export { RuntimeConnectionHost, RuntimeAuthHost } from './RuntimeConnectionHost';

export { useConnectivity } from './hooks/useConnectivity';
export type { ConnectivityStatus } from './hooks/useConnectivity';

export { useRuntimeSocketState } from './hooks/useRuntimeSocketState';
export { useSlotVerified } from './hooks/useSlotVerified';
export { useCloudVerified } from './hooks/useCloudVerified';
export { useVerifiedClouds } from './hooks/useVerifiedClouds';
export { RELAY_SLOT } from '@chatic/transport';

export { useBackgroundClouds } from './hooks/useBackgroundClouds';
export { useReclaimOwnedClouds } from './hooks/useReclaimOwnedClouds';

export {
    getRuntimeSocketState,
    getSlotStatuses,
    observeSocketRequests,
    onServerEvent,
    onServerMessage,
    reconnectSocket,
    recoverSocketsOnResume,
    recoverUnverifiedSockets,
    waitUntilVerified,
} from '@chatic/runtime-client';
export type { SlotKey, SlotStatus, SocketRequestSample } from '@chatic/transport';
export type { SocketCloseReason } from '@chatic/transport';
