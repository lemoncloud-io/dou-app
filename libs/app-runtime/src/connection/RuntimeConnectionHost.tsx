import React from 'react';

import { useRelaySessionInit, useRelaySessionKeepAlive } from '../session';
import { SocketBinder } from './SocketBinder';
import { SocketReauthBinder } from './SocketReauthBinder';
import { useSocketSessionDelegate } from './useSocketSessionDelegate';
import type { RuntimeBinding } from '../runtime';

export interface RuntimeConnectionHostProps {
    binding: RuntimeBinding;
    children?: React.ReactNode;
}

/**
 * Assembles the declarative connection host. It is the SINGLE web-core init driver: `useRelaySessionInit`
 * runs `initializeRelaySession` (transport + auth) once and gates the whole connection subtree until
 * ready — replacing the old separate `TransportBootstrap`, which independently re-triggered
 * `startWebCoreInit` (a duplicate initialization). The socket session delegate is owned here too, so
 * apps pass only the binding; socket lifecycle + SDK re-auth are handled by SocketBinder +
 * bootstrapSocketConnection.
 */
export const RuntimeConnectionHost = ({ binding, children }: RuntimeConnectionHostProps) => {
    const isSessionReady = useRelaySessionInit();
    const delegate = useSocketSessionDelegate();
    useRelaySessionKeepAlive(true);

    if (!isSessionReady) {
        return null;
    }

    return (
        <>
            <SocketBinder binding={binding} delegate={delegate} />
            <SocketReauthBinder binding={binding} delegate={delegate} />
            {children}
        </>
    );
};
