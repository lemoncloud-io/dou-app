import React from 'react';

import { TransportBootstrap } from './TransportBootstrap';
import { SessionBackgroundRunner } from './SessionBackgroundRunner';
import { RuntimeDataBinder } from './RuntimeDataBinder';
import { SocketBinder } from './SocketBinder';
import { SocketReauthBinder } from './SocketReauthBinder';
import { useSocketSessionDelegate } from './useSocketSessionDelegate';
import type { RuntimeBinding } from '../runtime';

export interface RuntimeConnectionHostProps {
    binding: RuntimeBinding;
    children?: React.ReactNode;
}

/**
 * Assembles the declarative connection host. The socket session delegate is owned here (app-runtime
 * depends on web-core), so apps no longer inject one — they pass only the binding. Socket lifecycle
 * and SDK-driven re-authentication are handled by SocketBinder + bootstrapSocketConnection.
 */
export const RuntimeConnectionHost = ({ binding, children }: RuntimeConnectionHostProps) => {
    const delegate = useSocketSessionDelegate();

    return (
        <TransportBootstrap>
            <SessionBackgroundRunner />
            <RuntimeDataBinder binding={binding} />
            <SocketBinder binding={binding} delegate={delegate} />
            <SocketReauthBinder binding={binding} delegate={delegate} />
            {children}
        </TransportBootstrap>
    );
};
