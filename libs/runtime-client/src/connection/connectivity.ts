import { isLinkDown } from '@chatic/transport';
import type { LinkSignals, SocketState } from '@chatic/transport';

import { readConnection } from './connectionCommands';

export type ConnectivityStatus = 'online' | 'reconnecting' | 'offline';

export interface ConnectivitySignals extends SocketState, LinkSignals {}

export const deriveConnectivity = ({
    isBrowserOnline,
    hasVerifiedSocket,
    state,
    isConnected,
    isVerified,
}: ConnectivitySignals): ConnectivityStatus => {
    if (isLinkDown({ isBrowserOnline, hasVerifiedSocket })) return 'offline';
    if (isConnected && isVerified) return 'online';
    if (state === 'idle') return 'online';
    return 'reconnecting';
};

export const readOnlineSignal = (): boolean => readConnection().online;
