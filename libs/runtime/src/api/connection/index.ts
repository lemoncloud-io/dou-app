export { RELAY_SLOT } from '@chatic/transport';
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
} from './connectionCommands';
export type { SlotKey, SlotStatus, SocketRequestSample } from '@chatic/transport';
export type { SocketCloseReason } from '@chatic/transport';
