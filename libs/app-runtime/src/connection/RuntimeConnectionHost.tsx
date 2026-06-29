import React, { useEffect } from 'react';
import { TransportBootstrap } from './TransportBootstrap';
import { SessionBackgroundRunner } from './SessionBackgroundRunner';
import { RuntimeDataBinder } from './RuntimeDataBinder';
import { SocketAuthBinder } from './SocketAuthBinder';
import { SocketBinder } from './SocketBinder';
import type { RuntimeBinding } from '../runtime/useRuntimeBinding';
import type { SocketSessionDelegate } from '../socket/types';
import { getSocketRuntime } from '../socket/runtime';

export interface RuntimeConnectionHostProps {
    binding: RuntimeBinding;
    delegate: SocketSessionDelegate;
    children?: React.ReactNode;
}

export const RuntimeConnectionHost = ({ binding, delegate, children }: RuntimeConnectionHostProps) => {
    // Inject delegate to SocketSessionController
    useEffect(() => {
        const socketRuntime = getSocketRuntime();
        socketRuntime.sessionController.setDelegate(delegate);
    }, [delegate]);

    return (
        <TransportBootstrap>
            <SessionBackgroundRunner />
            <RuntimeDataBinder binding={binding} />
            <SocketBinder binding={binding} />
            <SocketAuthBinder binding={binding} />
            {children}
        </TransportBootstrap>
    );
};
