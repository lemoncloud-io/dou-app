import React, { useEffect, useState } from 'react';
import { startWebCoreInit } from '@chatic/web-core';

export interface TransportBootstrapProps {
    children: React.ReactNode;
}

export const TransportBootstrap = ({ children }: TransportBootstrapProps) => {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        startWebCoreInit()
            .then(() => setIsReady(true))
            .catch(() => {
                setIsReady(true); // fall through on error so app doesn't freeze
            });
    }, []);

    if (!isReady) {
        return null;
    }

    return <>{children}</>;
};
