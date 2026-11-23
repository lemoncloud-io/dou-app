import React, { useEffect, useSyncExternalStore } from 'react';

import { useHostControllers } from './hooks/useHostControllers';
import type { ConnectionController } from '@chatic/runtime-client';

export interface RuntimeHostProps {
    children?: React.ReactNode;
}

const ConnectionSockets = ({ controller }: { controller: ConnectionController }) => {
    const passVersion = useSyncExternalStore(
        controller.subscribeSocketPass,
        controller.getSocketPassVersion,
        controller.getSocketPassVersion
    );
    useEffect(() => controller.startSockets(), [controller]);
    useEffect(() => controller.flushSockets(), [controller, passVersion]);
    return null;
};

const ConnectionHost = ({
    children,
    guestKeepAlive,
}: RuntimeHostProps & {
    guestKeepAlive: boolean;
}) => {
    const { session, connection: controller } = useHostControllers();
    const isSessionReady = useSyncExternalStore(session.subscribeReady, session.isReady, session.isReady);
    useEffect(() => {
        void session.initialize();
    }, [session]);
    useEffect(() => (guestKeepAlive ? session.startGuestKeepAlive() : undefined), [session, guestKeepAlive]);
    useEffect(() => controller.startBackground(), [controller]);

    if (!isSessionReady) {
        return null;
    }

    return (
        <>
            <ConnectionSockets controller={controller} />
            {children}
        </>
    );
};

export const RuntimeConnectionHost = (props: RuntimeHostProps) => <ConnectionHost {...props} guestKeepAlive />;

export const RuntimeAuthHost = (props: RuntimeHostProps) => <ConnectionHost {...props} guestKeepAlive={false} />;
